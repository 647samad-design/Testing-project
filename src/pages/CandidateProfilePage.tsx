import { useEffect, useState, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, Scale, GitCompare, MessageSquare, Globe, GraduationCap, Briefcase, Award, Shield, Heart, Search, Vote as VoteIcon, Newspaper, Video as VideoIcon, Play, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { IssueCard } from '@/components/shared/IssueCard';
import { EvidenceCard } from '@/components/shared/EvidenceCard';
import { SourceDrawer } from '@/components/shared/SourceDrawer';
import { DemoBanner } from '@/components/shared/DemoBanner';
import { VerificationBadge } from '@/components/shared/VerificationBadge';
import { SourceBadge } from '@/components/shared/SourceBadge';
import { LoadingState, ErrorState } from '@/components/shared/StateComponents';
import { getCandidate, getCandidatePositions, getCandidateStatements, getVotingRecord, getJudicialRecord } from '@/services/candidates';
import { getNews, getVideos, getSocialPosts } from '@/services/news';
import { getVerifiedClaim, getApprovedSubmissions, getApprovedQuestionnaire, getApprovedEvents } from '@/services/candidate-portal';
import { NewsCard } from '@/components/shared/NewsCard';
import { ClaimProfileButton } from '@/components/shared/ClaimProfileButton';
import { CandidateTags } from '@/components/shared/CandidateTags';
import { AdSlot } from '@/components/shared/AdSlot';
import type { Candidate, CandidatePosition, CandidateStatement, VotingRecord, JudicialRecord, NewsArticle, Video, SocialPost, CandidateClaim, CandidateSubmission, CandidateQuestionnaireResponse, CandidateEvent } from '@/types';
import { cn } from '@/lib/utils';
import { ShieldCheck, Calendar, MapPin } from 'lucide-react';
import { MessageCandidateButton } from '@/components/shared/MessageCandidateButton';
import { FollowButton } from '@/components/shared/FollowButton';
import { VerificationBadges, getVerificationLevels } from '@/components/shared/VerificationBadges';
import { QuestionsSection } from '@/components/shared/QuestionsSection';
import { OfficeDescriptionCard } from '@/components/shared/OfficeDescriptionCard';
import { PromisesTracker } from '@/components/shared/PromisesTracker';
import { ClaimsVsPlans } from '@/components/shared/ClaimsVsPlans';
import {
  CandidateSnapshot, ElectionInfo, WhyImRunningVideo,
  GetToKnowMe, WhoFundsMe, Endorsements,
} from '@/components/shared/CandidateProfileExtras';
import { getFeedPosts, trackProfileView } from '@/services/social';
import { getTeamMembers } from '@/services/social';
import type { FeedPost, CampaignTeamMember } from '@/types';

function getPartyClass(party: string | null): string {
  if (!party) return '';
  const p = party.toLowerCase();
  if (p.includes('democratic') || p.includes('democrat')) return 'party-dem';
  if (p.includes('republican') || p.includes('gop')) return 'party-rep';
  if (p.includes('independent') || p.includes('nonpartisan') || p.includes('libertarian') || p.includes('green')) return 'party-ind';
  return '';
}

export function CandidateProfilePage() {
  const { candidateId } = useParams<{ candidateId: string }>();
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [positions, setPositions] = useState<CandidatePosition[]>([]);
  const [statements, setStatements] = useState<CandidateStatement[]>([]);
  const [votingRecords, setVotingRecords] = useState<VotingRecord[]>([]);
  const [judicialRecord, setJudicialRecord] = useState<JudicialRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drawerPosition, setDrawerPosition] = useState<CandidatePosition | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [billSearch, setBillSearch] = useState('');
  const [voteFilter, setVoteFilter] = useState<'all' | 'yes' | 'no' | 'abstain' | 'absent'>('all');
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [videos, setVideos] = useState<Video[]>([]);
  const [social, setSocial] = useState<SocialPost[]>([]);
  const [verifiedClaim, setVerifiedClaim] = useState<CandidateClaim | null>(null);
  const [approvedSubs, setApprovedSubs] = useState<CandidateSubmission[]>([]);
  const [approvedQ, setApprovedQ] = useState<CandidateQuestionnaireResponse[]>([]);
  const [approvedEvents, setApprovedEvents] = useState<CandidateEvent[]>([]);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [teamMembers, setTeamMembers] = useState<CampaignTeamMember[]>([]);

  useEffect(() => {
    if (!candidateId) return;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [cand, pos, stmts, votes, judicial, newsData, videoData, socialData, claim, subs, questRes, events, feed, team] = await Promise.all([
          getCandidate(candidateId!),
          getCandidatePositions(candidateId!),
          getCandidateStatements(candidateId!),
          getVotingRecord(candidateId!),
          getJudicialRecord(candidateId!),
          getNews(candidateId!),
          getVideos(candidateId!),
          getSocialPosts(candidateId!),
          getVerifiedClaim(candidateId!),
          getApprovedSubmissions(candidateId!),
          getApprovedQuestionnaire(candidateId!),
          getApprovedEvents(candidateId!),
          getFeedPosts(candidateId!),
          getTeamMembers(candidateId!),
        ]);
        if (!cand) {
          setError("We couldn't find enough reliable information about this candidate.");
          return;
        }
        setCandidate(cand);
        setPositions(pos);
        setStatements(stmts);
        setVotingRecords(votes);
        setJudicialRecord(judicial);
        setNews(newsData);
        setVideos(videoData);
        setSocial(socialData);
        setVerifiedClaim(claim);
        setApprovedSubs(subs);
        setApprovedQ(questRes);
        setApprovedEvents(events);
        setFeedPosts(feed);
        setTeamMembers(team);
        // Track profile view for analytics
        trackProfileView(candidateId!).catch(() => {});
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load candidate.');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [candidateId]);

  function handleShowEvidence(pos: CandidatePosition) {
    setDrawerPosition(pos);
    setDrawerOpen(true);
  }

  if (loading) return <LoadingState message="Loading candidate profile…" />;
  if (error || !candidate) return <ErrorState message={error ?? 'Candidate not found.'} onRetry={() => window.history.back()} />;

  const fullName = `${candidate.first_name} ${candidate.last_name}`;
  const initials = `${candidate.first_name[0] ?? ''}${candidate.last_name[0] ?? ''}`;
  const isJudicial = judicialRecord !== null;

  return (
    <div className="mx-auto max-w-content px-4 sm:px-6 py-8 animate-fade-in">
      <Link to="/candidates" className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-primary transition-colors">
        <ArrowLeft className="h-4 w-4" />
        All candidates
      </Link>

      {/* Header */}
      <Card className="mt-4 p-6 rounded-2xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <Avatar className="h-20 w-20 border border-border bg-secondary shrink-0">
            {candidate.photo_url ? (
              <img src={candidate.photo_url} alt={fullName} className="h-full w-full object-cover" />
            ) : (
              <AvatarFallback className="bg-secondary text-xl font-semibold">{initials}</AvatarFallback>
            )}
          </Avatar>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-3xl font-semibold tracking-tight">{fullName}</h1>
            {verifiedClaim && (
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-success/10 px-2.5 py-1 text-sm font-semibold text-success">
                <ShieldCheck className="h-4 w-4" />
                Verified Candidate
              </span>
            )}
            {/* Verification levels */}
            <div className="mt-2">
              <VerificationBadges
                levels={getVerificationLevels(!!verifiedClaim, positions.length > 0, !candidate.is_demo)}
                size="xs"
              />
            </div>
            {candidate.party && (
              (() => {
                const pc = getPartyClass(candidate.party);
                return pc ? (
                  <span className={cn('mt-2 inline-flex items-center rounded-lg border px-2.5 py-1 text-sm font-semibold', pc)}>
                    {candidate.party}
                  </span>
                ) : (
                  <p className="mt-1 text-muted-foreground">{candidate.party}</p>
                );
              })()
            )}
            {candidate.is_demo && (
              <div className="mt-2">
                <DemoBanner compact />
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link to={`/compare?c=${candidate.id}`}>
                <Button variant="outline" size="sm" className="gap-2 rounded-xl touch-target">
                  <GitCompare className="h-4 w-4" />
                  Compare
                </Button>
              </Link>
              <Link to={`/ask?c=${candidate.id}`}>
                <Button variant="outline" size="sm" className="gap-2 rounded-xl touch-target">
                  <MessageSquare className="h-4 w-4" />
                  Ask AI
                </Button>
              </Link>
              {candidate.website_url && (
                <a href={candidate.website_url} target="_blank" rel="noopener noreferrer">
                  <Button variant="ghost" size="sm" className="gap-2 rounded-xl touch-target">
                    <Globe className="h-4 w-4" />
                    Website
                  </Button>
                </a>
              )}
              <ClaimProfileButton candidateId={candidate.id} candidateName={fullName} />
              <FollowButton followableType="candidate" followableId={candidate.id} size="sm" />
              <MessageCandidateButton candidateId={candidate.id} />
            </div>
          </div>
        </div>
      </Card>

      {/* Community tags */}
      <div className="mt-4">
        <CandidateTags candidateId={candidate.id} />
      </div>

      {/* Candidate-provided info (approved submissions) */}
      {approvedSubs.length > 0 && (
        <Card className="mt-4 p-4 rounded-2xl border-primary/20">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <p className="text-xs font-bold uppercase tracking-wider text-primary">
              Candidate-provided information
            </p>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {approvedSubs.map((sub) => (
              <div key={sub.id}>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  {sub.field_name.replace(/_/g, ' ')}
                </p>
                <p className="mt-0.5 text-sm text-foreground">{sub.field_value}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Upcoming events */}
      {approvedEvents.length > 0 && (
        <Card className="mt-4 p-4 rounded-2xl">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-foreground">Upcoming Events</h3>
          </div>
          <div className="mt-3 space-y-3">
            {approvedEvents.map((ev) => (
              <div key={ev.id} className="flex items-start gap-3 rounded-xl bg-secondary/30 p-3">
                <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-lg bg-primary/10">
                  <span className="text-xs font-bold text-primary">
                    {new Date(ev.event_date).toLocaleDateString('en-US', { month: 'short' })}
                  </span>
                  <span className="text-lg font-bold text-primary leading-none">
                    {new Date(ev.event_date).getDate()}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{ev.title}</p>
                  {ev.description && <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{ev.description}</p>}
                  <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
                    {ev.start_time && <span>{ev.start_time}</span>}
                    {ev.location_name && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{ev.location_name}{ev.city ? `, ${ev.city}` : ''}</span>}
                    {ev.virtual_url && <a href={ev.virtual_url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Virtual link</a>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Why I'm Running Video */}
      <div className="mt-4">
        <WhyImRunningVideo candidateId={candidate.id} />
      </div>

      {/* Candidate Snapshot */}
      <div className="mt-4">
        <CandidateSnapshot
          candidateId={candidate.id}
          photoUrl={candidate.photo_url}
          fullName={fullName}
          party={candidate.party}
        />
      </div>

      {/* Election Info */}
      <div className="mt-4">
        <ElectionInfo candidateId={candidate.id} />
      </div>

      {/* What Does This Office Do? */}
      <div className="mt-4">
        <OfficeDescriptionCard officeName={verifiedClaim?.office || 'County Commissioner'} />
      </div>

      {/* Get to Know Me */}
      <div className="mt-4">
        <GetToKnowMe candidateId={candidate.id} />
      </div>

      {/* Candidate questionnaire */}
      {approvedQ.length > 0 && (
        <Card className="mt-4 p-4 rounded-2xl">
          <h3 className="font-semibold text-foreground">Candidate Questionnaire</h3>
          <div className="mt-3 space-y-3">
            {approvedQ.map((q) => (
              <div key={q.id} className="rounded-xl bg-secondary/30 p-3">
                <p className="text-sm font-medium text-foreground">{q.question}</p>
                <p className="mt-1 text-sm text-muted-foreground">{q.answer ?? 'No response provided.'}</p>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Ad slot on candidate profile */}
      <div className="mt-6">
        <AdSlot placement="candidate_profile" />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="about" className="mt-6">
        <TabsList className="w-full justify-start overflow-x-auto no-scrollbar">
          <TabsTrigger value="about">About</TabsTrigger>
          <TabsTrigger value="feed">Feed</TabsTrigger>
          <TabsTrigger value="questions">Questions</TabsTrigger>
          <TabsTrigger value="positions">Where They Stand</TabsTrigger>
          <TabsTrigger value="claims">Claims &amp; Plans</TabsTrigger>
          <TabsTrigger value="promises">Promises</TabsTrigger>
          <TabsTrigger value="evidence">Track Record</TabsTrigger>
          <TabsTrigger value="news">News &amp; Media</TabsTrigger>
          {isJudicial && <TabsTrigger value="judicial">Judicial Record</TabsTrigger>}
        </TabsList>

        {/* ABOUT */}
        <TabsContent value="about" className="mt-6">
          <div className="grid gap-4 md:grid-cols-2">
            {candidate.bio && (
              <Card className="p-5 md:col-span-2">
                <h3 className="font-semibold text-foreground">Biography</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{candidate.bio}</p>
              </Card>
            )}
            {candidate.education && (
              <InfoCard icon={GraduationCap} title="Education" content={candidate.education} />
            )}
            {candidate.professional_background && (
              <InfoCard icon={Briefcase} title="Professional Background" content={candidate.professional_background} />
            )}
            {candidate.previous_offices && (
              <InfoCard icon={Award} title="Previous Offices" content={candidate.previous_offices} />
            )}
            {candidate.military_service && candidate.military_service !== 'None' && (
              <InfoCard icon={Shield} title="Military Service" content={candidate.military_service} />
            )}
            {candidate.public_service && candidate.public_service !== 'None' && (
              <InfoCard icon={Heart} title="Public Service" content={candidate.public_service} />
            )}
          </div>

          {/* Who Funds Me + Endorsements */}
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <WhoFundsMe candidateId={candidate.id} />
            <Endorsements candidateId={candidate.id} />
          </div>
        </TabsContent>

        {/* FEED */}
        <TabsContent value="feed" className="mt-6">
          {feedPosts.length > 0 ? (
            <div className="space-y-3">
              {feedPosts.map((post) => (
                <Card key={post.id} className="p-4 rounded-2xl">
                  <div className="flex items-center gap-2 mb-2">
                    {post.is_pinned && <span className="text-xs font-bold text-primary">Pinned</span>}
                    <span className="text-xs font-semibold text-muted-foreground">
                      {post.post_type === 'event' ? 'Event' : post.post_type === 'position_change' ? 'Position Update' : 'Update'}
                    </span>
                    <span className="text-xs text-muted-foreground">{new Date(post.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-foreground whitespace-pre-wrap">{post.body}</p>
                  {post.image_url && <img src={post.image_url} alt="" className="mt-2 rounded-xl max-h-60 object-cover" />}
                  {post.event_date && (
                    <div className="mt-2 rounded-xl border border-border bg-secondary/30 p-2 text-sm">
                      <span className="font-semibold">{new Date(post.event_date).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</span>
                      {post.event_start_time && <span className="text-muted-foreground"> at {post.event_start_time}</span>}
                      {post.event_location && <span className="text-muted-foreground"> — {post.event_location}</span>}
                    </div>
                  )}
                  {post.link_url && (
                    <a href={post.link_url} target="_blank" rel="noopener noreferrer" className="mt-2 block text-sm text-primary hover:underline">
                      {post.link_url}
                    </a>
                  )}
                </Card>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-sm text-muted-foreground">This candidate hasn't posted any updates yet.</p>
            </div>
          )}
        </TabsContent>

        {/* QUESTIONS (AMA) */}
        <TabsContent value="questions" className="mt-6">
          <QuestionsSection candidateId={candidate.id} canAnswer={!!verifiedClaim} />
        </TabsContent>

        {/* CLAIMS VS PLANS */}
        <TabsContent value="claims" className="mt-6">
          <ClaimsVsPlans candidateId={candidate.id} canEdit={!!verifiedClaim} />
        </TabsContent>

        {/* PROMISES TRACKER */}
        <TabsContent value="promises" className="mt-6">
          <PromisesTracker candidateId={candidate.id} canEdit={!!verifiedClaim} />
        </TabsContent>

        {/* WHERE THEY STAND */}
        <TabsContent value="positions" className="mt-6">
          {positions.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              Position not verified. Insufficient reliable information available.
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {positions.map((pos) => (
                <IssueCard
                  key={pos.id}
                  position={pos}
                  candidateId={candidate.id}
                  onShowEvidence={handleShowEvidence}
                />
              ))}
            </div>
          )}
        </TabsContent>

        {/* EVIDENCE */}
        <TabsContent value="evidence" className="mt-6 space-y-6">
          {/* Statements */}
          {statements.length > 0 && (
            <section>
              <h3 className="mb-3 font-bold text-foreground">Public Statements</h3>
              <div className="space-y-3">
                {statements.map((stmt) => (
                  <EvidenceCard key={stmt.id} type="statement" data={stmt} />
                ))}
              </div>
            </section>
          )}

          {/* Voting Records with search + filter */}
          {votingRecords.length > 0 && (
            <VotingRecordsSection
              records={votingRecords}
              search={billSearch}
              onSearchChange={setBillSearch}
              voteFilter={voteFilter}
              onVoteFilterChange={setVoteFilter}
            />
          )}

          {statements.length === 0 && votingRecords.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No public statements or voting records are available for this candidate yet.
            </p>
          )}
        </TabsContent>

        {/* NEWS & MEDIA */}
        <TabsContent value="news" className="mt-6 space-y-6">
          {news.length === 0 && videos.length === 0 && social.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No news or media coverage is available for this candidate yet.
            </p>
          ) : (
            <CandidateNewsSection
              news={news}
              videos={videos}
              social={social}
              candidateId={candidate.id}
            />
          )}
        </TabsContent>

        {/* JUDICIAL */}
        {isJudicial && judicialRecord && (
          <TabsContent value="judicial" className="mt-6">
            <div className="grid gap-4 md:grid-cols-2">
              {judicialRecord.current_position && (
                <InfoCard icon={Scale} title="Current Position" content={judicialRecord.current_position} />
              )}
              {judicialRecord.bar_admission_date && (
                <InfoCard icon={Award} title="Bar Admission" content={`Admitted: ${formatDate(judicialRecord.bar_admission_date)}${judicialRecord.bar_number ? ` — ${judicialRecord.bar_number}` : ''}`} />
              )}
              {judicialRecord.previous_judicial_experience && (
                <Card className="p-5 md:col-span-2">
                  <h3 className="font-semibold text-foreground">Previous Judicial Experience</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{judicialRecord.previous_judicial_experience}</p>
                </Card>
              )}
              {judicialRecord.notable_decisions && (
                <Card className="p-5 md:col-span-2">
                  <h3 className="font-semibold text-foreground">Notable Decisions</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{judicialRecord.notable_decisions}</p>
                </Card>
              )}
              {judicialRecord.endorsements && (
                <Card className="p-5 md:col-span-2">
                  <h3 className="font-semibold text-foreground">Endorsements</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{judicialRecord.endorsements}</p>
                </Card>
              )}
              {judicialRecord.disciplinary_records && (
                <Card className="p-5 md:col-span-2">
                  <h3 className="font-semibold text-foreground">Public Disciplinary Records</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{judicialRecord.disciplinary_records}</p>
                </Card>
              )}
              {judicialRecord.campaign_contributions_summary && (
                <Card className="p-5 md:col-span-2">
                  <h3 className="font-semibold text-foreground">Campaign Contributions</h3>
                  <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{judicialRecord.campaign_contributions_summary}</p>
                </Card>
              )}
            </div>
          </TabsContent>
        )}
      </Tabs>

      <SourceDrawer open={drawerOpen} onOpenChange={setDrawerOpen} position={drawerPosition} />
    </div>
  );
}

function VotingRecordsSection({
  records,
  search,
  onSearchChange,
  voteFilter,
  onVoteFilterChange,
}: {
  records: VotingRecord[];
  search: string;
  onSearchChange: (v: string) => void;
  voteFilter: 'all' | 'yes' | 'no' | 'abstain' | 'absent';
  onVoteFilterChange: (v: 'all' | 'yes' | 'no' | 'abstain' | 'absent') => void;
}) {
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (voteFilter !== 'all' && r.vote !== voteFilter) return false;
      if (!q) return true;
      return (
        r.bill_name.toLowerCase().includes(q) ||
        (r.bill_number?.toLowerCase().includes(q) ?? false) ||
        (r.description?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [records, search, voteFilter]);

  const voteCounts = useMemo(() => ({
    all: records.length,
    yes: records.filter((r) => r.vote === 'yes').length,
    no: records.filter((r) => r.vote === 'no').length,
    abstain: records.filter((r) => r.vote === 'abstain').length,
    absent: records.filter((r) => r.vote === 'absent').length,
  }), [records]);

  const filterButtons: { id: 'all' | 'yes' | 'no' | 'abstain' | 'absent'; label: string; color: string }[] = [
    { id: 'all', label: 'All Votes', color: 'bg-secondary text-foreground' },
    { id: 'yes', label: `Yes (${voteCounts.yes})`, color: 'bg-success/10 text-success' },
    { id: 'no', label: `No (${voteCounts.no})`, color: 'bg-destructive/10 text-destructive' },
    { id: 'abstain', label: `Abstain (${voteCounts.abstain})`, color: 'bg-warning/10 text-warning' },
    { id: 'absent', label: `Absent (${voteCounts.absent})`, color: 'bg-muted text-muted-foreground' },
  ];

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <VoteIcon className="h-5 w-5 text-primary" />
        <h3 className="font-bold text-foreground">Voting Records</h3>
        <span className="ml-auto text-sm text-muted-foreground">{filtered.length} of {records.length}</span>
      </div>

      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search by bill name, number, or topic…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-10 h-12 rounded-xl"
          aria-label="Search voting records"
        />
      </div>

      {/* Vote filter chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        {filterButtons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => onVoteFilterChange(btn.id)}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-xs font-bold transition-all touch-target',
              voteFilter === btn.id
                ? 'ring-2 ring-primary/30 ' + btn.color
                : 'bg-secondary text-muted-foreground hover:bg-secondary/70'
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-border bg-secondary/30 p-8 text-center">
          <Search className="mx-auto h-8 w-8 text-muted-foreground/50" />
          <p className="mt-3 text-sm text-muted-foreground">
            No voting records match your search. Try a different bill name or filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((vr) => (
            <EvidenceCard key={vr.id} type="vote" data={vr} />
          ))}
        </div>
      )}
    </section>
  );
}

function InfoCard({ icon: Icon, title, content }: { icon: React.ComponentType<{ className?: string }>; title: string; content: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-semibold text-foreground">{title}</h3>
          <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{content}</p>
        </div>
      </div>
    </Card>
  );
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function CandidateNewsSection({
  news, videos, social, candidateId,
}: {
  news: NewsArticle[];
  videos: Video[];
  social: SocialPost[];
  candidateId: string;
}) {
  return (
    <>
      {news.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-bold text-foreground">
              <Newspaper className="h-5 w-5 text-primary" />
              Articles
            </h3>
            <Link to={`/news?c=${candidateId}`} className="text-sm font-medium text-primary hover:underline">
              View all on News page
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {news.slice(0, 6).map((article) => (
              <NewsCard key={article.id} article={article} />
            ))}
          </div>
        </section>
      )}

      {videos.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-bold text-foreground">
              <VideoIcon className="h-5 w-5 text-primary" />
              Videos
            </h3>
            <Link to={`/news?c=${candidateId}`} className="text-sm font-medium text-primary hover:underline">
              View all on News page
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {videos.map((video) => (
              <a key={video.id} href={video.url ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
                <Card className="group p-4 transition-all hover:border-primary/30 hover:shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="relative flex h-16 w-24 shrink-0 items-center justify-center rounded-lg bg-secondary overflow-hidden">
                      <Play className="h-6 w-6 text-muted-foreground" />
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover:bg-black/30 transition-colors">
                        <Play className="h-6 w-6 text-white" />
                      </div>
                    </div>
                    <div className="min-w-0 flex-1">
                      {video.video_type && (
                        <span className="text-xs font-medium uppercase text-muted-foreground">{video.video_type.replace(/_/g, ' ')}</span>
                      )}
                      <h4 className="mt-1 font-medium text-foreground leading-snug group-hover:text-primary transition-colors">{video.title}</h4>
                      {video.publisher && <p className="mt-1 text-xs text-muted-foreground">{video.publisher}</p>}
                    </div>
                  </div>
                </Card>
              </a>
            ))}
          </div>
        </section>
      )}

      {social.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="flex items-center gap-2 font-bold text-foreground">
              <MessageCircle className="h-5 w-5 text-primary" />
              Social Posts
            </h3>
            <Link to={`/news?c=${candidateId}`} className="text-sm font-medium text-primary hover:underline">
              View all on News page
            </Link>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {social.map((post) => (
              <a key={post.id} href={post.url ?? '#'} target="_blank" rel="noopener noreferrer" className="block">
                <Card className="group p-4 transition-all hover:border-primary/30 hover:shadow-sm">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-rose-50">
                      <MessageCircle className="h-4 w-4 text-rose-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        {post.platform && <span className="text-xs font-medium text-muted-foreground">{post.platform}</span>}
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700">Social</span>
                      </div>
                      {post.content && <p className="mt-1 text-sm text-muted-foreground line-clamp-3">{post.content}</p>}
                      {post.posted_date && <p className="mt-1 text-xs text-muted-foreground">{formatDate(post.posted_date)}</p>}
                    </div>
                  </div>
                </Card>
              </a>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
