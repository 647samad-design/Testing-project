import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Vote, FileText, Bookmark, ShieldCheck, AlertCircle, User as UserIcon, BarChart3, Plus, Check, Flag, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import {
  getAdminMetrics, getUnverifiedPositions, verifyPosition, flagPositionOutdated,
  getSourceCountsForPositions, linkSourceToPosition,
  listCandidatesForAdmin, updateCandidate, deleteCandidate,
  listProfilesForAdmin, setAdminRole, getAuditLog,
  listPendingSubmissions, approveSubmission, rejectSubmission,
  bulkImportCandidates,
  compCandidateManagement, revokeCandidateManagement, listActiveManagementCandidateIds,
  getBillingOverview, type BillingOverview,
  getPendingClaims, approveClaim, rejectClaim, type PendingClaim,
  expireOverdueComps,
  getPendingEvents, approveEvent, rejectEvent, type PendingEvent,
  getPendingQuestionnaireResponses, approveQuestionnaireResponse, rejectQuestionnaireResponse, type PendingQuestionnaireResponse,
  getPendingAds, approveAd, rejectAd, type PendingAd,
  getPendingProfileExtras, reviewProfileExtra, type PendingProfileExtra, type ProfileExtraKind,
} from '@/services/admin';
import { getPendingReports, markReportReviewed, getReportedContentPreview, removeReportedFeedPost, type ContentReport } from '@/services/content-reports';
import { getUnresearchedClaims, assessClaimInLibrary, addClaimEvidence, type UnresearchedClaim } from '@/services/admin';
import { getRevenueSummary, type RevenueSummary } from '@/services/admin';
import {
  searchBallotContests, linkCandidateToContest, getCandidateContests, unlinkCandidateFromContest,
  type BallotContestOption,
} from '@/services/admin';
import { triggerNewsFetch, triggerElectionFetch, triggerDigestEmails, triggerElectionReminders } from '@/services/election-results';
import Papa from 'papaparse';
import { Upload as UploadIcon, RefreshCw } from 'lucide-react';
import type { VerificationStatus, Election, Source } from '@/types';
import { getElections as getElectionsList } from '@/services/elections';
import { getSources } from '@/services/sources';
import { deleteElection, deleteSource } from '@/services/admin';
import { addVotingRecord, addCandidatePosition } from '@/services/admin';
import { getIssues } from '@/services/districts';
import type { Issue } from '@/types';
import { Navigate } from 'react-router-dom';
import { LoadingState } from '@/components/shared/StateComponents';
import { PhotoUpload } from '@/components/shared/PhotoUpload';
import { toast } from 'sonner';
import { Pencil, Trash2, ShieldOff, ShieldCheck as ShieldCheckIcon, ScrollText, DollarSign } from 'lucide-react';
import { usePageMeta } from '@/hooks/use-page-meta';
import { SearchPicker } from '@/components/shared/SearchPicker';

export function AdminDashboardPage() {
  usePageMeta({ title: 'Admin', noindex: true });
  const { profile, loading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof getAdminMetrics>> | null>(null);
  const [unverified, setUnverified] = useState<Array<{ id: string; summary: string | null; verification_status: VerificationStatus; candidate: { first_name: string; last_name: string } | null; issue: { name: string } | null }>>([]);
  const [positionSourceCounts, setPositionSourceCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!profile?.is_admin) return;
    async function load() {
      const [m, uv] = await Promise.all([
        getAdminMetrics(),
        getUnverifiedPositions(),
      ]);
      setMetrics(m);
      setUnverified(uv as unknown as typeof unverified);
      setLoading(false);
      const counts = await getSourceCountsForPositions(uv.map((p) => p.id));
      setPositionSourceCounts(counts);
    }
    load();
  }, [profile]);

  if (authLoading) return <LoadingState message="Loading…" />;
  if (!profile?.is_admin) return <Navigate to="/" replace />;
  if (loading) return <LoadingState message="Loading admin dashboard…" />;

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">Admin Dashboard</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage candidates, elections, sources and verify information.
        </p>
      </div>

      {/* Metrics */}
      {metrics && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4 lg:grid-cols-7 mb-8">
          <MetricCard icon={Users} label="Candidates" value={metrics.candidates} />
          <MetricCard icon={Vote} label="Elections" value={metrics.elections} />
          <MetricCard icon={FileText} label="Contests" value={metrics.ballotContests} />
          <MetricCard icon={Bookmark} label="Sources" value={metrics.sources} />
          <MetricCard icon={ShieldCheck} label="Verified Positions" value={metrics.verifiedPositions} color="text-success" />
          <MetricCard icon={AlertCircle} label="Unverified Positions" value={metrics.unverifiedPositions} color="text-warning" />
          <MetricCard icon={UserIcon} label="Pending Claims" value={metrics.pendingProfileClaims} color="text-warning" />
          <MetricCard icon={UserIcon} label="Users" value={metrics.users} />
        </div>
      )}

      <Tabs defaultValue="claims">
        <TabsList>
          <TabsTrigger value="claims">Review Claims</TabsTrigger>
          <TabsTrigger value="review">Verify Positions</TabsTrigger>
          <TabsTrigger value="submissions">Content Submissions</TabsTrigger>
          <TabsTrigger value="add">Add Content</TabsTrigger>
          <TabsTrigger value="datafeeds">Data Feeds</TabsTrigger>
          <TabsTrigger value="billingoverview">Billing</TabsTrigger>
          <TabsTrigger value="manage">Manage Candidates</TabsTrigger>
          <TabsTrigger value="import">Import Candidates</TabsTrigger>
          <TabsTrigger value="admins">Admins</TabsTrigger>
          <TabsTrigger value="reports">Reports</TabsTrigger>
          <TabsTrigger value="claimslib">Claims Library</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

        {/* The ACTUAL "claim a candidate profile" approval queue —
            previously nothing here at all; the tab labeled "Review Claims"
            showed unverified positions instead, an unrelated workflow. */}
        <TabsContent value="claims" className="mt-6">
          <ClaimsReviewTab />
        </TabsContent>

        {/* Review unverified positions */}
        <TabsContent value="review" className="mt-6">
          <h2 className="mb-4 font-semibold">Unverified Candidate Positions</h2>
          {unverified.length === 0 ? (
            <p className="text-sm text-muted-foreground">All positions are verified.</p>
          ) : (
            <div className="space-y-3">
              {unverified.map((p) => (
                <Card key={p.id} className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground">
                        {p.candidate ? `${p.candidate.first_name} ${p.candidate.last_name}` : 'Unknown candidate'}
                        {' — '}
                        {p.issue?.name ?? 'Unknown issue'}
                      </p>
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {p.summary ?? 'No summary'}
                      </p>
                      <span className="mt-2 inline-block text-xs text-warning">
                        Status: {p.verification_status.replace(/_/g, ' ')}
                      </span>
                      <PositionSourcesInline
                        positionId={p.id}
                        count={positionSourceCounts[p.id] ?? 0}
                        onAttached={() => setPositionSourceCounts((prev) => ({ ...prev, [p.id]: (prev[p.id] ?? 0) + 1 }))}
                      />
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-success border-success/30 hover:bg-success/10"
                        onClick={async () => {
                          if ((positionSourceCounts[p.id] ?? 0) === 0 && !window.confirm('This position has no cited sources yet. Verify anyway?')) return;
                          try {
                            await verifyPosition(p.id);
                            setUnverified((prev) => prev.filter((x) => x.id !== p.id));
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Failed to verify. Please try again.');
                          }
                        }}
                      >
                        <Check className="h-4 w-4" />
                        Verify
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-warning border-warning/30 hover:bg-warning/10"
                        onClick={async () => {
                          try {
                            await flagPositionOutdated(p.id);
                            setUnverified((prev) => prev.filter((x) => x.id !== p.id));
                          } catch (err) {
                            toast.error(err instanceof Error ? err.message : 'Failed to flag. Please try again.');
                          }
                        }}
                      >
                        <Flag className="h-4 w-4" />
                        Flag
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* Add content */}
        <TabsContent value="submissions" className="mt-6">
          <SubmissionsTab />
        </TabsContent>

        <TabsContent value="add" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <AddCandidateForm />
            <AddSourceForm />
            <AddElectionForm />
            <AddMeasureForm />
            <AddVotingRecordForm />
            <AddCandidatePositionForm />
          </div>
          <div className="mt-6">
            <ManageRecordsPanel />
          </div>
        </TabsContent>

        <TabsContent value="datafeeds" className="mt-6">
          <DataFeedsTab />
        </TabsContent>

        <TabsContent value="billingoverview" className="mt-6">
          <BillingOverviewTab />
        </TabsContent>

        <TabsContent value="manage" className="mt-6">
          <ManageCandidatesTab />
        </TabsContent>

        <TabsContent value="import" className="mt-6">
          <ImportCandidatesTab />
        </TabsContent>

        <TabsContent value="admins" className="mt-6">
          <ManageAdminsTab currentUserId={profile.id} />
        </TabsContent>

        <TabsContent value="reports" className="mt-6">
          <ContentReportsTab />
        </TabsContent>

        <TabsContent value="claimslib" className="mt-6">
          <ClaimsLibraryAdminTab />
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <ActivityLogTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SubmissionsTab() {
  const [subs, setSubs] = useState<Awaited<ReturnType<typeof listPendingSubmissions>>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setSubs(await listPendingSubmissions());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load submissions.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      const result = await approveSubmission(id);
      toast.success(result.applied_to_candidates
        ? 'Approved and published to the candidate profile.'
        : `Approved — "${result.field_name}" doesn't map to a profile field yet, follow up manually.`);
      setSubs((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve submission.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    try {
      await rejectSubmission(id);
      toast.success('Submission rejected.');
      setSubs((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject submission.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading submissions…" />;

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <h3 className="font-semibold">Profile Content</h3>
        <p className="text-sm text-muted-foreground">
          Content candidates have submitted about themselves (bio, photo, links, etc). Approving a
          submission for a field like bio or photo publishes it straight to their profile.
        </p>
        {subs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No pending submissions.</p>
        ) : (
          subs.map((s) => (
            <Card key={s.id} className="p-4">
              <p className="text-sm font-medium">{s.field_name.replace(/_/g, ' ')}</p>
              <p className="mt-1 text-sm text-muted-foreground break-words line-clamp-3">{s.field_value || '(empty)'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{new Date(s.submitted_at).toLocaleString()}</p>
              <div className="mt-3 flex gap-2">
                <Button size="sm" disabled={busyId === s.id} onClick={() => handleApprove(s.id)}>Approve</Button>
                <Button size="sm" variant="outline" disabled={busyId === s.id} onClick={() => handleReject(s.id)}>Reject</Button>
              </div>
            </Card>
          ))
        )}
      </div>

      <div className="border-t border-border pt-6">
        <EventsReviewSection />
      </div>

      <div className="border-t border-border pt-6">
        <QuestionnaireReviewSection />
      </div>

      <div className="border-t border-border pt-6">
        <AdReviewSection />
      </div>

      <div className="border-t border-border pt-6">
        <ProfileExtrasReviewSection />
      </div>
    </div>
  );
}

function EventsReviewSection() {
  const [events, setEvents] = useState<PendingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setEvents(await getPendingEvents());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load events.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      await approveEvent(id);
      toast.success('Event approved and now public.');
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve event.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    try {
      await rejectEvent(id);
      toast.success('Event rejected.');
      setEvents((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject event.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading events…" />;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Candidate Events</h3>
      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending events.</p>
      ) : (
        events.map((e) => (
          <Card key={e.id} className="p-4">
            <p className="text-sm font-medium">{e.title}</p>
            <p className="text-xs text-muted-foreground">
              {e.candidate ? `${e.candidate.first_name} ${e.candidate.last_name} · ` : ''}{e.event_date}
              {e.start_time ? ` · ${e.start_time}` : ''}{e.location_name ? ` · ${e.location_name}` : ''}
            </p>
            {e.description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{e.description}</p>}
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={busyId === e.id} onClick={() => handleApprove(e.id)}>Approve</Button>
              <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => handleReject(e.id)}>Reject</Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function QuestionnaireReviewSection() {
  const [responses, setResponses] = useState<PendingQuestionnaireResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setResponses(await getPendingQuestionnaireResponses());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load responses.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(id: string) {
    setBusyId(id);
    try {
      await approveQuestionnaireResponse(id);
      toast.success('Response approved and now public.');
      setResponses((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve response.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(id: string) {
    setBusyId(id);
    try {
      await rejectQuestionnaireResponse(id);
      toast.success('Response rejected.');
      setResponses((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject response.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading responses…" />;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Candidate Q&amp;A Responses</h3>
      {responses.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending responses.</p>
      ) : (
        responses.map((r) => (
          <Card key={r.id} className="p-4">
            <p className="text-sm font-medium">{r.candidate ? `${r.candidate.first_name} ${r.candidate.last_name}` : 'Unknown candidate'}</p>
            <p className="mt-1 text-sm">{r.question}</p>
            <p className="mt-1 text-sm text-muted-foreground">{r.answer || '(no answer)'}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={busyId === r.id} onClick={() => handleApprove(r.id)}>Approve</Button>
              <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => handleReject(r.id)}>Reject</Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

const EXTRA_KIND_LABEL: Record<ProfileExtraKind, string> = {
  endorsement: 'Endorsement',
  funding: 'Funding source',
  get_to_know: 'Get to know',
};

function ProfileExtrasReviewSection() {
  const [items, setItems] = useState<PendingProfileExtra[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    getPendingProfileExtras()
      .then(setItems)
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Failed to load profile submissions.'))
      .finally(() => setLoading(false));
  }, []);

  async function handleDecision(item: PendingProfileExtra, decision: 'approved' | 'rejected') {
    setBusyId(item.id);
    try {
      await reviewProfileExtra(item.kind, item.id, decision);
      toast.success(decision === 'approved' ? 'Approved and now public.' : 'Rejected.');
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading profile submissions…" />;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Endorsements, Funding &amp; Get-to-Know</h3>
      <p className="text-sm text-muted-foreground">
        Submitted by candidates from their portal. Nothing here is public until approved.
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nothing pending.</p>
      ) : (
        items.map((item) => (
          <Card key={`${item.kind}-${item.id}`} className="p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {EXTRA_KIND_LABEL[item.kind]}{item.candidate ? ` · ${item.candidate.first_name} ${item.candidate.last_name}` : ''}
            </p>
            <p className="mt-1 text-sm break-words">{item.summary}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={busyId === item.id} onClick={() => handleDecision(item, 'approved')}>Approve</Button>
              <Button size="sm" variant="outline" disabled={busyId === item.id} onClick={() => handleDecision(item, 'rejected')}>Reject</Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function AdReviewSection() {
  const [ads, setAds] = useState<PendingAd[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setAds(await getPendingAds());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load ads.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(ad: PendingAd) {
    if (!window.confirm(`Approve "${ad.ad_title}" from ${ad.advertiser?.organization_name ?? 'this advertiser'}? It will immediately start showing to voters.`)) return;
    setBusyId(ad.id);
    try {
      await approveAd(ad.id);
      toast.success('Ad approved and now live.');
      setAds((prev) => prev.filter((a) => a.id !== ad.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve ad.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(ad: PendingAd) {
    const notes = window.prompt('Reason for rejecting (visible to the advertiser):') ?? undefined;
    setBusyId(ad.id);
    try {
      await rejectAd(ad.id, notes);
      toast.success('Ad rejected.');
      setAds((prev) => prev.filter((a) => a.id !== ad.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject ad.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading ads…" />;

  return (
    <div className="space-y-3">
      <h3 className="font-semibold">Advertiser Content Review</h3>
      <p className="text-sm text-muted-foreground">
        Ads only reach real voters once approved here — advertisers cannot activate their own ads.
      </p>
      {ads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pending ads.</p>
      ) : (
        ads.map((ad) => (
          <Card key={ad.id} className="p-4">
            <p className="text-sm font-medium">{ad.ad_title}</p>
            <p className="text-xs text-muted-foreground">
              {ad.advertiser?.organization_name ?? 'Unknown advertiser'} · {ad.placement} · {ad.ad_type}
            </p>
            {ad.ad_description && <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{ad.ad_description}</p>}
            <p className="mt-1 text-xs text-muted-foreground">
              Links to: <a href={ad.destination_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{ad.destination_url}</a>
            </p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" disabled={busyId === ad.id} onClick={() => handleApprove(ad)}>Approve</Button>
              <Button size="sm" variant="outline" disabled={busyId === ad.id} onClick={() => handleReject(ad)}>Reject</Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

type ImportRow = { first_name: string; last_name: string; party?: string; bio?: string; photo_url?: string };

function ImportCandidatesTab() {
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  function parseRows(raw: unknown[]): { valid: ImportRow[]; errors: string[] } {
    const valid: ImportRow[] = [];
    const errs: string[] = [];
    raw.forEach((r, i) => {
      const row = r as Record<string, string>;
      const first_name = (row.first_name || row.firstName || '').trim();
      const last_name = (row.last_name || row.lastName || '').trim();
      if (!first_name || !last_name) {
        errs.push(`Row ${i + 1}: missing first_name or last_name — skipped.`);
        return;
      }
      valid.push({
        first_name,
        last_name,
        party: (row.party || '').trim() || undefined,
        bio: (row.bio || '').trim() || undefined,
        photo_url: (row.photo_url || row.photoUrl || '').trim() || undefined,
      });
    });
    return { valid, errors: errs };
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setRows([]);
    setErrors([]);

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result);
        let raw: unknown[];
        if (file.name.endsWith('.json')) {
          const parsed = JSON.parse(text);
          raw = Array.isArray(parsed) ? parsed : [parsed];
        } else {
          const result = Papa.parse(text, { header: true, skipEmptyLines: true });
          raw = result.data as unknown[];
        }
        const { valid, errors: rowErrors } = parseRows(raw);
        setRows(valid);
        setErrors(rowErrors);
        if (valid.length === 0 && rowErrors.length === 0) {
          setErrors(['No rows found in file.']);
        }
      } catch (err) {
        setErrors([err instanceof Error ? `Could not parse file: ${err.message}` : 'Could not parse file.']);
      }
    };
    reader.readAsText(file);
  }

  async function handleImport() {
    if (rows.length === 0) return;
    setImporting(true);
    try {
      const { inserted, skippedDuplicates } = await bulkImportCandidates(rows);
      if (inserted > 0) {
        toast.success(`Imported ${inserted} candidate${inserted === 1 ? '' : 's'}.`);
      }
      if (skippedDuplicates.length > 0) {
        toast.info(`Skipped ${skippedDuplicates.length} already-existing candidate${skippedDuplicates.length === 1 ? '' : 's'}: ${skippedDuplicates.slice(0, 5).join(', ')}${skippedDuplicates.length > 5 ? '…' : ''}`);
      }
      setRows([]);
      setFileName(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed. No candidates were added.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-semibold mb-2 flex items-center gap-2">
          <UploadIcon className="h-4 w-4" /> Import Candidates from CSV or JSON
        </h3>
        <p className="text-sm text-muted-foreground mb-3">
          Columns: <code>first_name, last_name, party, bio, photo_url</code> (party/bio/photo_url optional).
          Photo URLs must already be hosted somewhere public — this doesn't fetch or copy images for you.
        </p>
        <input
          type="file"
          accept=".csv,.json"
          onChange={handleFile}
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-secondary file:px-3 file:py-1.5 file:text-sm"
        />
        {fileName && <p className="mt-2 text-xs text-muted-foreground">Loaded: {fileName}</p>}
      </Card>

      {errors.length > 0 && (
        <Card className="p-4 border-destructive/30">
          {errors.map((e, i) => <p key={i} className="text-xs text-destructive">{e}</p>)}
        </Card>
      )}

      {rows.length > 0 && (
        <Card className="p-4">
          <p className="text-sm font-medium mb-3">{rows.length} candidate{rows.length === 1 ? '' : 's'} ready to import</p>
          <div className="max-h-64 overflow-y-auto space-y-1.5">
            {rows.slice(0, 25).map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-sm border-b border-border/50 pb-1.5">
                <span className="font-medium">{r.first_name} {r.last_name}</span>
                <span className="text-muted-foreground text-xs">{r.party || 'No party'}</span>
              </div>
            ))}
            {rows.length > 25 && <p className="text-xs text-muted-foreground pt-1">…and {rows.length - 25} more</p>}
          </div>
          <Button onClick={handleImport} disabled={importing} className="mt-4">
            {importing ? 'Importing…' : `Import ${rows.length} Candidate${rows.length === 1 ? '' : 's'}`}
          </Button>
        </Card>
      )}
    </div>
  );
}

const OVERVIEW_PLAN_LABELS: Record<string, string> = {
  candidate_monthly: 'Candidate (Monthly)',
  candidate_yearly: 'Candidate (Yearly)',
  pro_monthly: 'Pro (Monthly)',
  pro_yearly: 'Pro (Yearly)',
  premium_monthly: 'Premium (Monthly, legacy)',
  premium_yearly: 'Premium (Yearly, legacy)',
};

/** payments.amount is stored in cents, matching Stripe's native format. */
function formatCents(cents: number): string {
  return (cents / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function ClaimsReviewTab() {
  const [claims, setClaims] = useState<PendingClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setClaims(await getPendingClaims());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load claims.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleApprove(claim: PendingClaim) {
    if (!window.confirm(`Verify ${claim.full_name} as the owner of ${claim.candidate?.first_name} ${claim.candidate?.last_name}'s profile? They'll immediately gain full candidate access (bio edits, team invites, campaign tools).`)) return;
    setBusyId(claim.id);
    try {
      await approveClaim(claim.id);
      toast.success('Claim approved.');
      setClaims((prev) => prev.filter((c) => c.id !== claim.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to approve claim.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleReject(claim: PendingClaim) {
    const notes = window.prompt('Reason for rejecting (optional, visible to the claimant):') ?? undefined;
    setBusyId(claim.id);
    try {
      await rejectClaim(claim.id, notes);
      toast.success('Claim rejected.');
      setClaims((prev) => prev.filter((c) => c.id !== claim.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to reject claim.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading pending claims…" />;

  if (claims.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No pending profile claims to review.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-2">
        Someone claiming a candidate profile gets full control over it once approved — verify their identity
        (email, campaign website, notes) before approving.
      </p>
      {claims.map((claim) => (
        <Card key={claim.id} className="p-5 rounded-2xl">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold">
                {claim.full_name} <span className="font-normal text-muted-foreground">claims to be</span>{' '}
                {claim.candidate ? `${claim.candidate.first_name} ${claim.candidate.last_name}` : 'Unknown candidate'}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Email: {claim.email}</p>
              {claim.campaign_website && (
                <p className="text-sm text-muted-foreground">Website: <a href={claim.campaign_website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{claim.campaign_website}</a></p>
              )}
              {claim.office && <p className="text-sm text-muted-foreground">Office: {claim.office}</p>}
              {claim.verification_notes && (
                <p className="mt-2 text-sm bg-secondary/50 rounded-lg p-2">{claim.verification_notes}</p>
              )}
              <p className="mt-2 text-xs text-muted-foreground">Submitted {new Date(claim.submitted_at).toLocaleDateString()}</p>
            </div>
            <div className="flex shrink-0 gap-2">
              <Button size="sm" disabled={busyId === claim.id} onClick={() => handleApprove(claim)} className="gap-1.5">
                <Check className="h-3.5 w-3.5" /> Approve
              </Button>
              <Button size="sm" variant="outline" disabled={busyId === claim.id} onClick={() => handleReject(claim)} className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10">
                <X className="h-3.5 w-3.5" /> Reject
              </Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function BillingOverviewTab() {
  const [overview, setOverview] = useState<BillingOverview | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([getBillingOverview(), getRevenueSummary()])
      .then(([overviewData, revenueData]) => {
        setOverview(overviewData);
        setRevenue(revenueData);
        setLoading(false);
      })
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : 'Failed to load billing overview.');
        setLoading(false);
      });
  }, []);

  if (loading) return <LoadingState message="Loading billing overview…" />;
  if (!overview) return <p className="text-sm text-muted-foreground">Could not load billing data.</p>;

  return (
    <div className="space-y-5">
      {revenue && (
        <Card className="p-5 bg-gradient-to-br from-primary/5 to-transparent">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><DollarSign className="h-4 w-4" /> Total Revenue</h3>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">All-Time</p>
              <p className="mt-1 text-3xl font-bold text-primary">{formatCents(revenue.totalCents)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Last 30 Days</p>
              <p className="mt-1 text-3xl font-bold">{formatCents(revenue.last30DaysCents)}</p>
            </div>
          </div>
          {Object.keys(revenue.byType).length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50 space-y-1.5">
              {Object.entries(revenue.byType).map(([type, cents]) => (
                <div key={type} className="flex items-center justify-between text-sm">
                  <span className="capitalize text-muted-foreground">{type.replace(/_/g, ' ')}</span>
                  <span className="font-medium">{formatCents(cents)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Total Users</p>
          <p className="mt-1 text-2xl font-bold">{overview.totalUsers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Free</p>
          <p className="mt-1 text-2xl font-bold">{overview.freeUsers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Paid</p>
          <p className="mt-1 text-2xl font-bold text-primary">{overview.paidUsers}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">Management (active)</p>
          <p className="mt-1 text-2xl font-bold">{overview.managementActive}<span className="text-sm font-normal text-muted-foreground"> +{overview.managementComped} comped</span></p>
        </Card>
      </div>

      <Card className="p-5">
        <h3 className="font-semibold mb-3 flex items-center gap-2"><DollarSign className="h-4 w-4" /> Breakdown by Plan</h3>
        {Object.keys(overview.byPlan).length === 0 ? (
          <p className="text-sm text-muted-foreground">No paid subscriptions yet.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(overview.byPlan).map(([plan, count]) => (
              <div key={plan} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                <span>{OVERVIEW_PLAN_LABELS[plan] ?? plan}</span>
                <span className="font-semibold">{count}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-3">Recent Subscriptions</h3>
        {overview.recentSubscriptions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No paid subscriptions yet.</p>
        ) : (
          <div className="space-y-2">
            {overview.recentSubscriptions.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                <div>
                  <p className="font-medium">{s.full_name ?? 'Unnamed user'}</p>
                  <p className="text-xs text-muted-foreground">
                    {OVERVIEW_PLAN_LABELS[s.plan] ?? s.plan} · {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={`text-xs font-medium rounded-full px-2 py-0.5 ${s.status === 'active' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'}`}>
                  {s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function DataFeedsTab() {
  const [newsLoading, setNewsLoading] = useState(false);
  const [electionLoading, setElectionLoading] = useState(false);
  const [newsResult, setNewsResult] = useState<string | null>(null);
  const [electionResult, setElectionResult] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [digestResult, setDigestResult] = useState<string | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);
  const [reminderResult, setReminderResult] = useState<string | null>(null);
  const [expireLoading, setExpireLoading] = useState(false);
  const [expireResult, setExpireResult] = useState<string | null>(null);

  async function handleExpireComps() {
    setExpireLoading(true);
    setExpireResult(null);
    try {
      const result = await expireOverdueComps();
      setExpireResult(
        result.expiredCount === 0
          ? '✅ No overdue comps found — nothing needed expiring.'
          : `✅ Expired ${result.expiredCount} overdue comp(s): ${result.expiredCandidateNames.join(', ')}.`
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to check for overdue comps.');
    } finally {
      setExpireLoading(false);
    }
  }

  async function handleReminderRun(dryRun: boolean) {
    setReminderLoading(true);
    setReminderResult(null);
    try {
      const result = await triggerElectionReminders(dryRun);
      if (result.success) {
        setReminderResult(
          `✅ ${dryRun ? '(Dry run) ' : ''}Checked ${result.electionsChecked} upcoming election(s) — ${result.remindersSent} reminder(s) ${dryRun ? 'would be sent' : 'sent'}.` +
          (result.errors.length > 0 ? ` ${result.errors.length} error(s).` : '')
        );
      } else {
        toast.error(result.error ?? 'Reminder run failed.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reminder run failed.');
    } finally {
      setReminderLoading(false);
    }
  }

  async function handleDigestRun(dryRun: boolean) {
    setDigestLoading(true);
    setDigestResult(null);
    try {
      const result = await triggerDigestEmails(dryRun);
      if (result.success) {
        setDigestResult(
          `✅ ${dryRun ? '(Dry run) ' : ''}Checked ${result.usersChecked} users due today — ${result.sent} sent, ${result.skippedEmpty} skipped (nothing new).` +
          (result.errors.length > 0 ? ` ${result.errors.length} error(s).` : '')
        );
      } else {
        toast.error(result.error ?? 'Digest run failed.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Digest run failed.');
    } finally {
      setDigestLoading(false);
    }
  }

  async function handleNewsRefresh() {
    setNewsLoading(true);
    setNewsResult(null);
    try {
      const result = await triggerNewsFetch();
      if (result.success) {
        setNewsResult(`✅ Added ${result.articlesAdded} new article${result.articlesAdded === 1 ? '' : 's'}.`);
      } else {
        toast.error(result.error ?? 'News fetch failed.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'News fetch failed.');
    } finally {
      setNewsLoading(false);
    }
  }

  async function handleElectionRefresh() {
    setElectionLoading(true);
    setElectionResult(null);
    try {
      const result = await triggerElectionFetch();
      if (result.success) {
        setElectionResult(`✅ Processed ${result.racesProcessed} race${result.racesProcessed === 1 ? '' : 's'}, ${result.newWinnersCalled} new winner${result.newWinnersCalled === 1 ? '' : 's'} called.`);
      } else {
        toast.error(result.error ?? 'Election data fetch failed.');
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Election data fetch failed.');
    } finally {
      setElectionLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <h3 className="font-semibold mb-2">AP Elections Results</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Pulls live/certified race results from the AP Elections API and posts winner
          announcements to the feed. Requires <code>AP_ELECTIONS_API_KEY</code> to be set as an
          Edge Function secret — if it's missing, this will show a clear error instead of failing silently.
        </p>
        <Button onClick={handleElectionRefresh} disabled={electionLoading} size="sm" className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${electionLoading ? 'animate-spin' : ''}`} />
          {electionLoading ? 'Fetching…' : 'Refresh Election Results'}
        </Button>
        {electionResult && <p className="mt-2 text-sm">{electionResult}</p>}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-2">Civic News</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Pulls recent headlines from AP News, Reuters, and CNN's public RSS feeds into the feed.
          No API key required for this one.
        </p>
        <Button onClick={handleNewsRefresh} disabled={newsLoading} size="sm" className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${newsLoading ? 'animate-spin' : ''}`} />
          {newsLoading ? 'Fetching…' : 'Refresh Civic News'}
        </Button>
        {newsResult && <p className="mt-2 text-sm">{newsResult}</p>}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-2">BallotLens Digest Emails</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Sends the digest email to every user who's due today (weekly subscribers get it on
          Mondays, daily subscribers every day) and has something new to report. Requires{' '}
          <code>RESEND_API_KEY</code> to be set as an Edge Function secret.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => handleDigestRun(true)} disabled={digestLoading} size="sm" variant="outline" className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${digestLoading ? 'animate-spin' : ''}`} />
            Preview (dry run)
          </Button>
          <Button onClick={() => handleDigestRun(false)} disabled={digestLoading} size="sm" className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${digestLoading ? 'animate-spin' : ''}`} />
            {digestLoading ? 'Sending…' : 'Send Digest Now'}
          </Button>
        </div>
        {digestResult && <p className="mt-2 text-sm">{digestResult}</p>}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-2">Election Reminders</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Sends an instant reminder (email + in-app) for elections in the next 14 days to users
          who follow a candidate in that race or set an explicit reminder — deduplicated, so it's
          safe to run repeatedly. Also requires <code>RESEND_API_KEY</code>.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => handleReminderRun(true)} disabled={reminderLoading} size="sm" variant="outline" className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${reminderLoading ? 'animate-spin' : ''}`} />
            Preview (dry run)
          </Button>
          <Button onClick={() => handleReminderRun(false)} disabled={reminderLoading} size="sm" className="gap-1.5">
            <RefreshCw className={`h-3.5 w-3.5 ${reminderLoading ? 'animate-spin' : ''}`} />
            {reminderLoading ? 'Sending…' : 'Send Reminders Now'}
          </Button>
        </div>
        {reminderResult && <p className="mt-2 text-sm">{reminderResult}</p>}
      </Card>

      <Card className="p-5">
        <h3 className="font-semibold mb-2">Comped Management Expiration</h3>
        <p className="text-sm text-muted-foreground mb-3">
          Checks free ("comped") Candidate Management grants — like the first-year-free beta plan
          — and expires any whose 1-year period has passed. Never touches real paying subscriptions.
        </p>
        <Button onClick={handleExpireComps} disabled={expireLoading} size="sm" className="gap-1.5">
          <RefreshCw className={`h-3.5 w-3.5 ${expireLoading ? 'animate-spin' : ''}`} />
          {expireLoading ? 'Checking…' : 'Check for Overdue Comps'}
        </Button>
        {expireResult && <p className="mt-2 text-sm">{expireResult}</p>}
      </Card>

      <p className="text-xs text-muted-foreground">
        These run on-demand only right now — nothing refreshes automatically yet. For production,
        consider setting up a scheduled job (Supabase Cron) to call these on a timer instead of
        relying on someone clicking the button.
      </p>
    </div>
  );
}

function ManageCandidatesTab() {
  const [candidates, setCandidates] = useState<Awaited<ReturnType<typeof listCandidatesForAdmin>>>([]);
  const [managedIds, setManagedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ first_name: string; last_name: string; party: string; photo_url: string | null }>({ first_name: '', last_name: '', party: '', photo_url: null });
  const [saving, setSaving] = useState(false);
  const [managementBusyId, setManagementBusyId] = useState<string | null>(null);
  const [raceEditId, setRaceEditId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const [cands, activeIds] = await Promise.all([listCandidatesForAdmin(), listActiveManagementCandidateIds()]);
      setCandidates(cands);
      setManagedIds(new Set(activeIds));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load candidates.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCompManagement(id: string, name: string) {
    setManagementBusyId(id);
    try {
      await compCandidateManagement(id, 'Beta launch — first year free');
      toast.success(`Granted free Candidate Management to ${name}.`);
      setManagedIds((prev) => new Set(prev).add(id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to grant Management.');
    } finally {
      setManagementBusyId(null);
    }
  }

  async function handleRevokeManagement(id: string, name: string) {
    if (!window.confirm(`Revoke Candidate Management access for ${name}?`)) return;
    setManagementBusyId(id);
    try {
      await revokeCandidateManagement(id);
      toast.success(`Revoked Management access for ${name}.`);
      setManagedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to revoke Management.');
    } finally {
      setManagementBusyId(null);
    }
  }

  function startEdit(c: (typeof candidates)[number]) {
    setEditingId(c.id);
    setDraft({ first_name: c.first_name, last_name: c.last_name, party: c.party ?? '', photo_url: c.photo_url });
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      await updateCandidate(id, draft);
      toast.success('Candidate updated.');
      setEditingId(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save changes.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete ${name}? This cannot be undone.`)) return;
    try {
      await deleteCandidate(id);
      toast.success('Candidate deleted.');
      setCandidates((prev) => prev.filter((c) => c.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete candidate.');
    }
  }

  if (loading) return <LoadingState message="Loading candidates…" />;

  return (
    <div className="space-y-3">
      {candidates.length === 0 ? (
        <p className="text-sm text-muted-foreground">No candidates yet.</p>
      ) : (
        candidates.map((c) => (
          <Card key={c.id} className="p-4">
            {editingId === c.id ? (
              <div className="space-y-3">
                <PhotoUpload candidateId={c.id} currentUrl={draft.photo_url} onUploaded={(url) => setDraft((d) => ({ ...d, photo_url: url || null }))} />
                <div className="grid grid-cols-2 gap-3">
                  <Input value={draft.first_name} onChange={(e) => setDraft((d) => ({ ...d, first_name: e.target.value }))} placeholder="First name" />
                  <Input value={draft.last_name} onChange={(e) => setDraft((d) => ({ ...d, last_name: e.target.value }))} placeholder="Last name" />
                </div>
                <Input value={draft.party} onChange={(e) => setDraft((d) => ({ ...d, party: e.target.value }))} placeholder="Party" />
                <div className="flex gap-2">
                  <Button size="sm" disabled={saving} onClick={() => saveEdit(c.id)}>{saving ? 'Saving…' : 'Save'}</Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditingId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-secondary">
                    {c.photo_url && <img src={c.photo_url} alt={`${c.first_name} ${c.last_name}`} className="h-full w-full object-cover" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{c.first_name} {c.last_name}</p>
                    <p className="text-xs text-muted-foreground">{c.party || 'No party listed'}{c.is_demo ? ' · Demo data' : ''}{managedIds.has(c.id) ? ' · Management active' : ''}</p>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  {managedIds.has(c.id) ? (
                    <Button size="sm" variant="outline" disabled={managementBusyId === c.id} className="gap-1.5 text-warning border-warning/30" onClick={() => handleRevokeManagement(c.id, `${c.first_name} ${c.last_name}`)}>
                      Revoke Management
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled={managementBusyId === c.id} className="gap-1.5" onClick={() => handleCompManagement(c.id, `${c.first_name} ${c.last_name}`)}>
                      Grant Free Management
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => startEdit(c)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setRaceEditId(raceEditId === c.id ? null : c.id)}>
                    <Vote className="h-3.5 w-3.5" /> Race
                  </Button>
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleDelete(c.id, `${c.first_name} ${c.last_name}`)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            )}
            {raceEditId === c.id && (
              <div className="mt-3 border-t border-border pt-3">
                <RaceLinkingPanel candidateId={c.id} />
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}

function RaceLinkingPanel({ candidateId }: { candidateId: string }) {
  const [linked, setLinked] = useState<BallotContestOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<BallotContestOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  async function load() {
    setLoading(true);
    try {
      setLinked(await getCandidateContests(candidateId));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [candidateId]);

  async function handleSearch() {
    setSearching(true);
    try {
      setResults(await searchBallotContests(search));
    } finally {
      setSearching(false);
    }
  }

  async function handleLink(contestId: string) {
    setBusy(true);
    try {
      await linkCandidateToContest(candidateId, contestId);
      toast.success('Linked to race — this candidate will now appear on matching ballots.');
      setResults([]);
      setSearch('');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to link candidate to race.');
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink(contestId: string) {
    if (!window.confirm('Remove this candidate from this race? They will no longer appear on matching ballots.')) return;
    setBusy(true);
    try {
      await unlinkCandidateFromContest(candidateId, contestId);
      toast.success('Removed from race.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove candidate from race.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <p className="text-xs text-muted-foreground">Loading races…</p>;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Running In</p>
        {linked.length === 0 ? (
          <p className="text-xs text-destructive">
            Not linked to any race yet — this candidate will not appear on any voter's ballot until linked below.
          </p>
        ) : (
          <div className="space-y-1.5">
            {linked.map((contest) => (
              <div key={contest.id} className="flex items-center justify-between text-xs bg-secondary/50 rounded-lg px-2.5 py-1.5">
                <span>{contest.office_name}{contest.election ? ` · ${contest.election.name}` : ''}</span>
                <button disabled={busy} onClick={() => handleUnlink(contest.id)} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">Link to a Race</p>
        <div className="flex gap-2">
          <Input value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSearch()} placeholder="Search office name (e.g. 'City Council')" className="text-xs h-8" />
          <Button size="sm" onClick={handleSearch} disabled={searching}>Search</Button>
        </div>
        {results.length > 0 && (
          <div className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {results.map((contest) => (
              <button
                key={contest.id}
                disabled={busy}
                onClick={() => handleLink(contest.id)}
                className="w-full text-left text-xs bg-secondary/30 hover:bg-secondary/60 rounded-lg px-2.5 py-1.5 transition-colors"
              >
                {contest.office_name}{contest.election ? ` · ${contest.election.name}` : ''}{contest.seat_description ? ` · ${contest.seat_description}` : ''}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ManageAdminsTab({ currentUserId }: { currentUserId: string }) {
  const [profiles, setProfiles] = useState<Awaited<ReturnType<typeof listProfilesForAdmin>>>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setProfiles(await listProfilesForAdmin());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleAdmin(id: string, next: boolean, name: string) {
    const message = next
      ? `Grant full admin access to ${name}? They'll be able to edit/delete any candidate, manage other admins, and see all platform data.`
      : `Revoke admin access from ${name}? They'll immediately lose all admin permissions.`;
    if (!window.confirm(message)) return;
    setBusyId(id);
    try {
      await setAdminRole(id, next);
      toast.success(next ? 'Admin access granted.' : 'Admin access revoked.');
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update admin role.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading users…" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Grant or revoke admin access. You cannot remove your own admin status here as a safety measure.
      </p>
      {profiles.map((p) => (
        <Card key={p.id} className="p-4 flex items-center justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{p.full_name || 'Unnamed user'}</p>
            <p className="text-xs text-muted-foreground">{p.is_admin ? 'Admin' : 'Standard user'}</p>
          </div>
          {p.is_admin ? (
            <Button
              size="sm" variant="outline" disabled={busyId === p.id || p.id === currentUserId}
              className="gap-1.5 text-warning border-warning/30 hover:bg-warning/10"
              onClick={() => toggleAdmin(p.id, false, p.full_name || 'this user')}
            >
              <ShieldOff className="h-3.5 w-3.5" /> Revoke admin
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busyId === p.id} className="gap-1.5" onClick={() => toggleAdmin(p.id, true, p.full_name || 'this user')}>
              <ShieldCheckIcon className="h-3.5 w-3.5" /> Make admin
            </Button>
          )}
        </Card>
      ))}
    </div>
  );
}

function ContentReportsTab() {
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [previews, setPreviews] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      const rows = await getPendingReports();
      setReports(rows);
      const entries = await Promise.all(
        rows.map(async (r) => [r.id, await getReportedContentPreview(r.content_type, r.content_id)] as const)
      );
      setPreviews(Object.fromEntries(entries));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load reports.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleResolve(id: string, outcome: 'actioned' | 'dismissed') {
    setBusyId(id);
    try {
      await markReportReviewed(id, outcome);
      toast.success(outcome === 'actioned' ? 'Marked as actioned.' : 'Dismissed.');
      setReports((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update report.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleRemovePost(report: ContentReport) {
    if (!window.confirm('Permanently remove this feed post? This cannot be undone.')) return;
    setBusyId(report.id);
    try {
      await removeReportedFeedPost(report.content_id);
      await markReportReviewed(report.id, 'actioned');
      toast.success('Post removed and report marked actioned.');
      setReports((prev) => prev.filter((r) => r.id !== report.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to remove the post.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading reports…" />;

  if (reports.length === 0) {
    return <p className="text-sm text-muted-foreground py-8 text-center">No pending reports — nothing flagged right now.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-2">
        Content flagged by users as false, abusive, or spam. Reported feed posts can be removed directly here;
        for other content, fix it in the relevant tab, then mark the report actioned.
      </p>
      {reports.map((r) => (
        <Card key={r.id} className="p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{r.reason} <span className="font-normal text-muted-foreground">— {r.content_type.replace(/_/g, ' ')}</span></p>
              <p className="mt-1 text-sm bg-secondary/40 rounded-lg px-2.5 py-1.5 break-words">
                {previews[r.id] ?? <span className="text-muted-foreground italic">Content no longer exists or can't be previewed.</span>}
              </p>
              {r.description && <p className="mt-1 text-sm text-muted-foreground">Reporter's note: {r.description}</p>}
              <p className="mt-1 text-xs text-muted-foreground">Reported {new Date(r.created_at).toLocaleDateString()}</p>
            </div>
            <div className="shrink-0 flex flex-col gap-2">
              {r.content_type === 'feed_post' && previews[r.id] && (
                <Button size="sm" variant="outline" className="text-destructive border-destructive/30 hover:bg-destructive/10" disabled={busyId === r.id} onClick={() => handleRemovePost(r)}>Remove Post</Button>
              )}
              <Button size="sm" disabled={busyId === r.id} onClick={() => handleResolve(r.id, 'actioned')}>Mark Actioned</Button>
              <Button size="sm" variant="outline" disabled={busyId === r.id} onClick={() => handleResolve(r.id, 'dismissed')}>Dismiss</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}

function ClaimsLibraryAdminTab() {
  const [claims, setClaims] = useState<UnresearchedClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draftAssessment, setDraftAssessment] = useState<Record<string, string>>({});
  const [draftExplanation, setDraftExplanation] = useState<Record<string, string>>({});
  const [draftSource, setDraftSource] = useState<Record<string, string>>({});
  const [draftNote, setDraftNote] = useState<Record<string, string>>({});
  const [evidenceCount, setEvidenceCount] = useState<Record<string, number>>({});

  async function handleAttachEvidence(claimId: string) {
    const sourceId = draftSource[claimId];
    if (!sourceId) return;
    setBusyId(claimId);
    try {
      await addClaimEvidence(claimId, sourceId, draftNote[claimId]);
      toast.success('Evidence attached.');
      setEvidenceCount((prev) => ({ ...prev, [claimId]: (prev[claimId] ?? 0) + 1 }));
      setDraftSource((prev) => ({ ...prev, [claimId]: '' }));
      setDraftNote((prev) => ({ ...prev, [claimId]: '' }));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to attach evidence.');
    } finally {
      setBusyId(null);
    }
  }

  async function load() {
    setLoading(true);
    try {
      setClaims(await getUnresearchedClaims());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load claims.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleAssess(claim: UnresearchedClaim) {
    const assessment = (draftAssessment[claim.id] ?? 'supported') as 'supported' | 'unsupported' | 'requires_context' | 'insufficient_information';
    const explanation = draftExplanation[claim.id]?.trim();
    if (!explanation) {
      toast.error('Add an explanation before publishing an assessment.');
      return;
    }
    if ((evidenceCount[claim.id] ?? 0) === 0 && !window.confirm('No evidence sources are attached to this claim. Publish the assessment anyway?')) return;
    setBusyId(claim.id);
    try {
      await assessClaimInLibrary(claim.id, assessment, explanation);
      toast.success('Claim assessed and published to the Claims Library.');
      setClaims((prev) => prev.filter((c) => c.id !== claim.id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save assessment.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading claims…" />;

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-2">
        Claims submitted by users, awaiting research. Publishing an assessment here makes it public
        on the Claims Library page immediately.
      </p>
      {claims.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">No unresearched claims right now.</p>
      ) : (
        claims.map((claim) => (
          <Card key={claim.id} className="p-4">
            <p className="text-sm font-medium">{claim.claim_text}</p>
            {claim.candidate && (
              <p className="text-xs text-muted-foreground mt-0.5">Re: {claim.candidate.first_name} {claim.candidate.last_name}</p>
            )}
            <div className="mt-3 space-y-2">
              <select
                value={draftAssessment[claim.id] ?? 'supported'}
                onChange={(e) => setDraftAssessment((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="supported">Supported by Evidence</option>
                <option value="unsupported">Not Supported</option>
                <option value="requires_context">Requires Context</option>
              </select>
              <textarea
                value={draftExplanation[claim.id] ?? ''}
                onChange={(e) => setDraftExplanation((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                placeholder="Explain the assessment with specifics (this is shown publicly)..."
                rows={3}
                className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
              />
              <div className="rounded-lg border border-border/60 p-2.5 space-y-2">
                <p className={`text-xs font-medium ${(evidenceCount[claim.id] ?? 0) === 0 ? 'text-destructive' : 'text-muted-foreground'}`}>
                  {(evidenceCount[claim.id] ?? 0) === 0 ? '⚠ No evidence attached yet' : `${evidenceCount[claim.id]} evidence source${evidenceCount[claim.id] === 1 ? '' : 's'} attached`}
                </p>
                <SourceSearchPicker value={draftSource[claim.id] ?? ''} onChange={(id) => setDraftSource((prev) => ({ ...prev, [claim.id]: id }))} />
                <Input
                  value={draftNote[claim.id] ?? ''}
                  onChange={(e) => setDraftNote((prev) => ({ ...prev, [claim.id]: e.target.value }))}
                  placeholder="What this source shows (optional)"
                  className="text-xs h-8"
                />
                <Button size="sm" variant="outline" disabled={!draftSource[claim.id] || busyId === claim.id} onClick={() => handleAttachEvidence(claim.id)}>
                  Attach Evidence
                </Button>
              </div>
              <Button size="sm" disabled={busyId === claim.id} onClick={() => handleAssess(claim)}>
                Publish Assessment
              </Button>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function ActivityLogTab() {
  const [entries, setEntries] = useState<Awaited<ReturnType<typeof getAuditLog>>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        setEntries(await getAuditLog());
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to load activity log.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <LoadingState message="Loading activity…" />;

  return (
    <div className="space-y-2">
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No admin activity recorded yet.</p>
      ) : (
        entries.map((e) => (
          <Card key={e.id} className="p-3 flex items-start gap-3">
            <ScrollText className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{e.action.replace(/_/g, ' ')}</p>
              <p className="text-xs text-muted-foreground">
                {e.target_table ? `${e.target_table}${e.target_id ? ` · ${e.target_id}` : ''} · ` : ''}
                {new Date(e.created_at).toLocaleString()}
              </p>
            </div>
          </Card>
        ))
      )}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, color }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number; color?: string }) {
  return (
    <Card className="p-4">
      <Icon className={`h-5 w-5 ${color ?? 'text-muted-foreground'}`} />
      <p className="mt-2 text-2xl font-bold">{value}</p>
      <p className="text-xs text-muted-foreground">{label}</p>
    </Card>
  );
}

function PositionSourcesInline({ positionId, count, onAttached }: { positionId: string; count: number; onAttached: () => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Source[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSearch() {
    setSearching(true);
    try {
      const all = await getSources();
      setResults(
        query.trim()
          ? all.filter((s) => s.title.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
          : all.slice(0, 10)
      );
    } finally {
      setSearching(false);
    }
  }

  async function handleAttach(sourceId: string) {
    setBusy(true);
    try {
      await linkSourceToPosition(positionId, sourceId);
      toast.success('Source attached.');
      onAttached();
      setResults([]);
      setQuery('');
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to attach source.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className={`inline-flex items-center gap-1 text-xs font-medium ${count === 0 ? 'text-destructive' : 'text-muted-foreground hover:text-primary'}`}
      >
        {count === 0 ? '⚠ No sources cited' : `${count} source${count === 1 ? '' : 's'} cited`} · {open ? 'Close' : 'Attach a source'}
      </button>
      {open && (
        <div className="mt-2 flex gap-2">
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Search sources by title…"
            className="text-xs h-8"
          />
          <Button size="sm" onClick={handleSearch} disabled={searching}>Search</Button>
        </div>
      )}
      {open && results.length > 0 && (
        <div className="mt-2 space-y-1.5 max-h-40 overflow-y-auto">
          {results.map((s) => (
            <button
              key={s.id}
              disabled={busy}
              onClick={() => handleAttach(s.id)}
              className="w-full text-left text-xs bg-secondary/30 hover:bg-secondary/60 rounded-lg px-2.5 py-1.5 transition-colors truncate"
            >
              {s.title} {s.publisher ? `· ${s.publisher}` : ''}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function AddCandidateForm() {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [party, setParty] = useState('');
  const [bio, setBio] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { addCandidate } = await import('@/services/admin');
      await addCandidate({ first_name: firstName, last_name: lastName, party, bio, photo_url: photoUrl });
      setFirstName(''); setLastName(''); setParty(''); setBio(''); setPhotoUrl(null);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add candidate. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4" /> Add Candidate
      </h3>
      <div className="space-y-3">
        <PhotoUpload candidateId="new" currentUrl={photoUrl} onUploaded={(url) => setPhotoUrl(url || null)} />
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">First Name</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Last Name</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Party</Label>
          <Input value={party} onChange={(e) => setParty(e.target.value)} placeholder="Democratic Party" />
        </div>
        <div>
          <Label className="text-xs">Bio</Label>
          <Input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Brief biography…" />
        </div>
        <Button onClick={handleSave} disabled={!firstName || !lastName || saving} size="sm" className="w-full">
          {saving ? 'Saving…' : saved ? 'Added!' : 'Add Candidate'}
        </Button>
      </div>
    </Card>
  );
}

function AddSourceForm() {
  const [title, setTitle] = useState('');
  const [url, setUrl] = useState('');
  const [publisher, setPublisher] = useState('');
  const [sourceType, setSourceType] = useState('news');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { addSource } = await import('@/services/admin');
      await addSource({ title, url, publisher, source_type: sourceType });
      setTitle(''); setUrl(''); setPublisher('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add source. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4" /> Add Source
      </h3>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">URL</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Publisher</Label>
          <Input value={publisher} onChange={(e) => setPublisher(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Source Type</Label>
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="news">News</option>
            <option value="government">Government</option>
            <option value="campaign">Campaign</option>
            <option value="legislative">Legislative</option>
            <option value="interview">Interview</option>
            <option value="debate">Debate</option>
            <option value="social">Social</option>
            <option value="opinion">Opinion</option>
          </select>
        </div>
        <Button onClick={handleSave} disabled={!title || saving} size="sm" className="w-full">
          {saving ? 'Saving…' : saved ? 'Added!' : 'Add Source'}
        </Button>
      </div>
    </Card>
  );
}

function AddElectionForm() {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { addElection } = await import('@/services/admin');
      await addElection({ name, election_date: date, description: '' });
      setName(''); setDate('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add election. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4" /> Add Election
      </h3>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Election Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="2028 General Election" />
        </div>
        <div>
          <Label className="text-xs">Election Date</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <Button onClick={handleSave} disabled={!name || !date || saving} size="sm" className="w-full">
          {saving ? 'Saving…' : saved ? 'Added!' : 'Add Election'}
        </Button>
      </div>
    </Card>
  );
}

function AddMeasureForm() {
  const [title, setTitle] = useState('');
  const [measureType, setMeasureType] = useState('amendment');
  const [summary, setSummary] = useState('');
  const [electionId, setElectionId] = useState('');
  const [electionsList, setElectionsList] = useState<Election[]>([]);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getElectionsList().then((els) => {
      setElectionsList(els);
      if (els.length > 0) setElectionId(els[0].id);
    });
  }, []);

  async function handleSave() {
    if (!electionId) {
      toast.error('Create an election first, then add a ballot measure.');
      return;
    }
    setSaving(true);
    try {
      const { addBallotMeasure } = await import('@/services/admin');
      await addBallotMeasure({ election_id: electionId, title, measure_type: measureType, summary });
      setTitle(''); setSummary('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add ballot measure. Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4" /> Add Ballot Measure
      </h3>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Election</Label>
          <select value={electionId} onChange={(e) => setElectionId(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            {electionsList.length === 0 && <option value="">No elections yet — create one first</option>}
            {electionsList.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Title</Label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <Label className="text-xs">Type</Label>
          <select value={measureType} onChange={(e) => setMeasureType(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="amendment">Amendment</option>
            <option value="referendum">Referendum</option>
            <option value="local">Local Measure</option>
          </select>
        </div>
        <div>
          <Label className="text-xs">Summary</Label>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
        </div>
        <Button onClick={handleSave} disabled={!title || !electionId || saving} size="sm" className="w-full">
          {saving ? 'Saving…' : saved ? 'Added!' : 'Add Measure'}
        </Button>
      </div>
    </Card>
  );
}

function CandidateSearchPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [candidates, setCandidates] = useState<Awaited<ReturnType<typeof listCandidatesForAdmin>>>([]);
  useEffect(() => { listCandidatesForAdmin().then(setCandidates); }, []);
  return (
    <SearchPicker
      items={candidates}
      value={value}
      onChange={onChange}
      getLabel={(c) => `${c.first_name} ${c.last_name}${c.party ? ` (${c.party})` : ''}`}
      placeholder="Search candidate by name…"
    />
  );
}

function SourceSearchPicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [sources, setSourcesList] = useState<Source[]>([]);
  useEffect(() => { getSources().then(setSourcesList); }, []);
  return (
    <SearchPicker
      items={sources}
      value={value}
      onChange={onChange}
      getLabel={(s) => `${s.title}${s.publisher ? ` · ${s.publisher}` : ''}`}
      placeholder="Search sources by title (optional)…"
    />
  );
}

function AddVotingRecordForm() {
  const [candidateId, setCandidateId] = useState('');
  const [billName, setBillName] = useState('');
  const [billNumber, setBillNumber] = useState('');
  const [vote, setVote] = useState('yes');
  const [voteDate, setVoteDate] = useState('');
  const [chamber, setChamber] = useState('');
  const [description, setDescription] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!candidateId || !billName.trim()) return;
    setSaving(true);
    try {
      await addVotingRecord({
        candidate_id: candidateId, bill_name: billName.trim(), bill_number: billNumber.trim() || undefined,
        vote, vote_date: voteDate || undefined, chamber: chamber.trim() || undefined, description: description.trim() || undefined,
        source_id: sourceId || undefined,
      });
      setBillName(''); setBillNumber(''); setVoteDate(''); setChamber(''); setDescription(''); setSourceId('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add voting record.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="h-4 w-4" /> Add Voting Record</h3>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Candidate</Label>
          <CandidateSearchPicker value={candidateId} onChange={setCandidateId} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Bill Name</Label>
            <Input value={billName} onChange={(e) => setBillName(e.target.value)} placeholder="e.g. Property Tax Reform Act" />
          </div>
          <div>
            <Label className="text-xs">Bill Number</Label>
            <Input value={billNumber} onChange={(e) => setBillNumber(e.target.value)} placeholder="HB 123" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">Vote</Label>
            <select value={vote} onChange={(e) => setVote(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
              <option value="yes">Yes</option>
              <option value="no">No</option>
              <option value="abstain">Abstain</option>
              <option value="absent">Absent</option>
            </select>
          </div>
          <div>
            <Label className="text-xs">Vote Date</Label>
            <Input type="date" value={voteDate} onChange={(e) => setVoteDate(e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-xs">Chamber (optional)</Label>
          <Input value={chamber} onChange={(e) => setChamber(e.target.value)} placeholder="e.g. State Senate" />
        </div>
        <div>
          <Label className="text-xs">Source (optional, but recommended)</Label>
          <SourceSearchPicker value={sourceId} onChange={setSourceId} />
        </div>
        <div>
          <Label className="text-xs">Description</Label>
          <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What the bill does…" />
        </div>
        <Button onClick={handleSave} disabled={!candidateId || !billName.trim() || saving} size="sm" className="w-full">
          {saving ? 'Saving…' : saved ? 'Added!' : 'Add Voting Record'}
        </Button>
      </div>
    </Card>
  );
}

function AddCandidatePositionForm() {
  const [candidateId, setCandidateId] = useState('');
  const [issueId, setIssueId] = useState('');
  const [issues, setIssues] = useState<Issue[]>([]);
  const [summary, setSummary] = useState('');
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => { getIssues().then(setIssues); }, []);

  async function handleSave() {
    if (!candidateId || !issueId || !summary.trim()) return;
    setSaving(true);
    try {
      await addCandidatePosition({ candidate_id: candidateId, issue_id: issueId, summary: summary.trim() });
      setSummary('');
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add position.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2"><Plus className="h-4 w-4" /> Add Candidate Position</h3>
      <div className="space-y-3">
        <div>
          <Label className="text-xs">Candidate</Label>
          <CandidateSearchPicker value={candidateId} onChange={setCandidateId} />
        </div>
        <div>
          <Label className="text-xs">Issue</Label>
          <select value={issueId} onChange={(e) => setIssueId(e.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm">
            <option value="">Select an issue…</option>
            {issues.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
        <div>
          <Label className="text-xs">Position Summary</Label>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} placeholder="Where they stand, in a sentence or two…" />
        </div>
        <p className="text-xs text-muted-foreground">
          New positions start as "not verified" — verify sourcing in the Verify Positions tab before it counts as reviewed.
        </p>
        <Button onClick={handleSave} disabled={!candidateId || !issueId || !summary.trim() || saving} size="sm" className="w-full">
          {saving ? 'Saving…' : saved ? 'Added!' : 'Add Position'}
        </Button>
      </div>
    </Card>
  );
}

function ManageRecordsPanel() {
  const [electionsList, setElectionsList] = useState<Election[]>([]);
  const [sourcesList, setSourcesList] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [view, setView] = useState<'elections' | 'sources'>('elections');

  async function load() {
    setLoading(true);
    try {
      const [els, srcs] = await Promise.all([getElectionsList(), getSources()]);
      setElectionsList(els);
      setSourcesList(srcs);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load records.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleDeleteElection(id: string, name: string) {
    if (!window.confirm(`Delete election "${name}"? This will also delete any ballot contests and measures tied to it. This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await deleteElection(id);
      toast.success('Election deleted.');
      setElectionsList((prev) => prev.filter((e) => e.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete — it may still be referenced elsewhere.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDeleteSource(id: string, title: string) {
    if (!window.confirm(`Delete source "${title}"? This cannot be undone.`)) return;
    setBusyId(id);
    try {
      await deleteSource(id);
      toast.success('Source deleted.');
      setSourcesList((prev) => prev.filter((s) => s.id !== id));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete — it may still be cited as evidence elsewhere.');
    } finally {
      setBusyId(null);
    }
  }

  if (loading) return <LoadingState message="Loading records…" />;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-3">
        <Button size="sm" variant={view === 'elections' ? 'default' : 'outline'} onClick={() => setView('elections')}>Elections</Button>
        <Button size="sm" variant={view === 'sources' ? 'default' : 'outline'} onClick={() => setView('sources')}>Sources</Button>
      </div>
      {view === 'elections' ? (
        electionsList.length === 0 ? (
          <p className="text-sm text-muted-foreground">No elections yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {electionsList.map((e) => (
              <div key={e.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                <div>
                  <p className="font-medium">{e.name}</p>
                  <p className="text-xs text-muted-foreground">{e.election_date}</p>
                </div>
                <button disabled={busyId === e.id} onClick={() => handleDeleteElection(e.id, e.name)} className="text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )
      ) : (
        sourcesList.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sources yet.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {sourcesList.map((s) => (
              <div key={s.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-xs text-muted-foreground truncate">{s.publisher}</p>
                </div>
                <button disabled={busyId === s.id} onClick={() => handleDeleteSource(s.id, s.title)} className="shrink-0 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )
      )}
    </Card>
  );
}
