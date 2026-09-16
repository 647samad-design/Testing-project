import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Vote, FileText, Bookmark, ShieldCheck, AlertCircle, User as UserIcon, BarChart3, Plus, Check, Flag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import {
  getAdminMetrics, getUnverifiedPositions, verifyPosition, flagPositionOutdated,
  listCandidatesForAdmin, updateCandidate, deleteCandidate,
  listProfilesForAdmin, setAdminRole, getAuditLog,
  listPendingSubmissions, approveSubmission, rejectSubmission,
  bulkImportCandidates,
  compCandidateManagement, revokeCandidateManagement, listActiveManagementCandidateIds,
} from '@/services/admin';
import { triggerNewsFetch, triggerElectionFetch } from '@/services/election-results';
import Papa from 'papaparse';
import { Upload as UploadIcon, RefreshCw } from 'lucide-react';
import type { VerificationStatus } from '@/types';
import { Navigate } from 'react-router-dom';
import { LoadingState } from '@/components/shared/StateComponents';
import { PhotoUpload } from '@/components/shared/PhotoUpload';
import { toast } from 'sonner';
import { Pencil, Trash2, ShieldOff, ShieldCheck as ShieldCheckIcon, ScrollText } from 'lucide-react';

export function AdminDashboardPage() {
  const { profile, loading: authLoading } = useAuth();
  const [metrics, setMetrics] = useState<Awaited<ReturnType<typeof getAdminMetrics>> | null>(null);
  const [unverified, setUnverified] = useState<Array<{ id: string; summary: string | null; verification_status: VerificationStatus; candidate: { first_name: string; last_name: string } | null; issue: { name: string } | null }>>([]);
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
          <MetricCard icon={ShieldCheck} label="Verified" value={metrics.verifiedClaims} color="text-success" />
          <MetricCard icon={AlertCircle} label="Unverified" value={metrics.unverifiedClaims} color="text-warning" />
          <MetricCard icon={UserIcon} label="Users" value={metrics.users} />
        </div>
      )}

      <Tabs defaultValue="review">
        <TabsList>
          <TabsTrigger value="review">Review Claims</TabsTrigger>
          <TabsTrigger value="submissions">Content Submissions</TabsTrigger>
          <TabsTrigger value="add">Add Content</TabsTrigger>
          <TabsTrigger value="datafeeds">Data Feeds</TabsTrigger>
          <TabsTrigger value="manage">Manage Candidates</TabsTrigger>
          <TabsTrigger value="import">Import Candidates</TabsTrigger>
          <TabsTrigger value="admins">Admins</TabsTrigger>
          <TabsTrigger value="activity">Activity Log</TabsTrigger>
        </TabsList>

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
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 text-success border-success/30 hover:bg-success/10"
                        onClick={async () => {
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
        <TabsContent value="review" />
        <TabsContent value="submissions" className="mt-6">
          <SubmissionsTab />
        </TabsContent>

        <TabsContent value="add" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <AddCandidateForm />
            <AddSourceForm />
            <AddElectionForm />
            <AddMeasureForm />
          </div>
        </TabsContent>

        <TabsContent value="datafeeds" className="mt-6">
          <DataFeedsTab />
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
    <div className="space-y-3">
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
      const { inserted } = await bulkImportCandidates(rows);
      toast.success(`Imported ${inserted} candidate${inserted === 1 ? '' : 's'}.`);
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

function DataFeedsTab() {
  const [newsLoading, setNewsLoading] = useState(false);
  const [electionLoading, setElectionLoading] = useState(false);
  const [newsResult, setNewsResult] = useState<string | null>(null);
  const [electionResult, setElectionResult] = useState<string | null>(null);

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
                    {c.photo_url && <img src={c.photo_url} alt="" className="h-full w-full object-cover" />}
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
                  <Button size="sm" variant="outline" className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10" onClick={() => handleDelete(c.id, `${c.first_name} ${c.last_name}`)}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </div>
              </div>
            )}
          </Card>
        ))
      )}
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

  async function toggleAdmin(id: string, next: boolean) {
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
              onClick={() => toggleAdmin(p.id, false)}
            >
              <ShieldOff className="h-3.5 w-3.5" /> Revoke admin
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={busyId === p.id} className="gap-1.5" onClick={() => toggleAdmin(p.id, true)}>
              <ShieldCheckIcon className="h-3.5 w-3.5" /> Make admin
            </Button>
          )}
        </Card>
      ))}
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
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const { addBallotMeasure } = await import('@/services/admin');
      // Use the first election
      const { supabase } = await import('@/lib/supabase');
      const { data } = await supabase.from('elections').select('id').order('election_date', { ascending: false }).limit(1).maybeSingle();
      if (!data) {
        toast.error('Create an election first, then add a ballot measure.');
        return;
      }
      await addBallotMeasure({ election_id: data.id, title, measure_type: measureType, summary });
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
        <Button onClick={handleSave} disabled={!title || saving} size="sm" className="w-full">
          {saving ? 'Saving…' : saved ? 'Added!' : 'Add Measure'}
        </Button>
      </div>
    </Card>
  );
}
