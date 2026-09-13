import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Vote, FileText, Bookmark, ShieldCheck, AlertCircle, User as UserIcon, BarChart3, Plus, Check, Flag } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { getAdminMetrics, getUnverifiedPositions, verifyPosition, flagPositionOutdated } from '@/services/admin';
import type { VerificationStatus } from '@/types';
import { Navigate } from 'react-router-dom';
import { LoadingState } from '@/components/shared/StateComponents';

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
          <TabsTrigger value="add">Add Content</TabsTrigger>
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
                          await verifyPosition(p.id);
                          setUnverified((prev) => prev.filter((x) => x.id !== p.id));
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
                          await flagPositionOutdated(p.id);
                          setUnverified((prev) => prev.filter((x) => x.id !== p.id));
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
        <TabsContent value="add" className="mt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <AddCandidateForm />
            <AddSourceForm />
            <AddElectionForm />
            <AddMeasureForm />
          </div>
        </TabsContent>
      </Tabs>
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
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const { addCandidate } = await import('@/services/admin');
    await addCandidate({ first_name: firstName, last_name: lastName, party, bio });
    setFirstName(''); setLastName(''); setParty(''); setBio('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
  }

  return (
    <Card className="p-5">
      <h3 className="font-semibold mb-3 flex items-center gap-2">
        <Plus className="h-4 w-4" /> Add Candidate
      </h3>
      <div className="space-y-3">
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
        <Button onClick={handleSave} disabled={!firstName || !lastName} size="sm" className="w-full">
          {saved ? 'Added!' : 'Add Candidate'}
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

  async function handleSave() {
    const { addSource } = await import('@/services/admin');
    await addSource({ title, url, publisher, source_type: sourceType });
    setTitle(''); setUrl(''); setPublisher('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
        <Button onClick={handleSave} disabled={!title} size="sm" className="w-full">
          {saved ? 'Added!' : 'Add Source'}
        </Button>
      </div>
    </Card>
  );
}

function AddElectionForm() {
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    const { addElection } = await import('@/services/admin');
    await addElection({ name, election_date: date, description: '' });
    setName(''); setDate('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
        <Button onClick={handleSave} disabled={!name || !date} size="sm" className="w-full">
          {saved ? 'Added!' : 'Add Election'}
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

  async function handleSave() {
    const { addBallotMeasure } = await import('@/services/admin');
    // Use the first election
    const { supabase } = await import('@/lib/supabase');
    const { data } = await supabase.from('elections').select('id').order('election_date', { ascending: false }).limit(1).maybeSingle();
    if (!data) return;
    await addBallotMeasure({ election_id: data.id, title, measure_type: measureType, summary });
    setTitle(''); setSummary('');
    setSaved(true);
    setTimeout(() => setSaved(false), 3000);
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
        <Button onClick={handleSave} disabled={!title} size="sm" className="w-full">
          {saved ? 'Added!' : 'Add Measure'}
        </Button>
      </div>
    </Card>
  );
}
