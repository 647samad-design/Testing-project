import { useState, useEffect } from 'react';
import {
  Briefcase, MapPin, Building2, Home, Bell, Calendar, Clock,
  Play, CircleDollarSign, Percent, Handshake, Award, Users,
  Heart, Utensils, Trophy, Briefcase as BriefcaseIcon, MapPin as MapPinIcon,
  Sparkles, CalendarDays, Info, ShieldCheck,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/use-auth';
import {
  getProfileExtras, getGetToKnow, getFundingSources, getEndorsements,
  toggleElectionReminder,
} from '@/services/candidate-profile-extras';
import type {
  CandidateProfileExtras, CandidateGetToKnow, CandidateFundingSource,
  CandidateEndorsement,
} from '@/types';

// ─── Candidate Snapshot ────────────────────────────────────────────────────

export function CandidateSnapshot({
  candidateId, photoUrl, fullName, party,
}: {
  candidateId: string;
  photoUrl: string | null;
  fullName: string;
  party: string | null;
}) {
  const [extras, setExtras] = useState<CandidateProfileExtras | null>(null);

  useEffect(() => {
    getProfileExtras(candidateId).then(setExtras);
  }, [candidateId]);

  const fields = [
    extras?.office_sought && { icon: Building2, label: 'Office Sought', value: extras.office_sought },
    extras?.district && { icon: MapPin, label: 'District', value: extras.district },
    party && { icon: Award, label: 'Party', value: party },
    extras?.current_occupation && { icon: Briefcase, label: 'Current Occupation', value: extras.current_occupation },
    extras?.hometown_area && { icon: Home, label: 'Hometown / Area', value: extras.hometown_area },
  ].filter(Boolean) as { icon: typeof Briefcase; label: string; value: string }[];

  if (fields.length === 0) return null;

  return (
    <Card className="p-5 rounded-2xl">
      <h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground mb-4">
        Candidate Snapshot
      </h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map((f) => (
          <div key={f.label} className="flex items-start gap-2.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary">
              <f.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{f.label}</p>
              <p className="text-sm font-semibold text-foreground truncate">{f.value}</p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Election Info ─────────────────────────────────────────────────────────

export function ElectionInfo({ candidateId }: { candidateId: string }) {
  const { user } = useAuth();
  const [extras, setExtras] = useState<CandidateProfileExtras | null>(null);
  const [reminderOn, setReminderOn] = useState(false);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    getProfileExtras(candidateId).then(setExtras);
  }, [candidateId]);

  if (!extras?.election_date && !extras?.next_election_date && !extras?.term_length) return null;

  const electionDate = extras?.election_date ? new Date(extras.election_date) : null;
  const nextElection = extras?.next_election_date ? new Date(extras.next_election_date) : null;
  const daysToNext = nextElection
    ? Math.max(0, Math.ceil((nextElection.getTime() - Date.now()) / 86400000))
    : null;

  async function handleNotify() {
    if (!user) return;
    setToggling(true);
    const result = await toggleElectionReminder(candidateId, user.id);
    setReminderOn(result.enabled);
    setToggling(false);
  }

  return (
    <Card className="p-5 rounded-2xl">
      <div className="flex items-center gap-2 mb-4">
        <CalendarDays className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm uppercase tracking-wide text-muted-foreground">
          Election Info
        </h3>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {extras?.election_date && (
          <div className="rounded-xl bg-secondary/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Election Date</p>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {electionDate?.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        )}
        {extras?.election_type && (
          <div className="rounded-xl bg-secondary/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Election Type</p>
            <p className="text-sm font-bold text-foreground mt-0.5 capitalize">{extras.election_type}</p>
          </div>
        )}
        {extras?.district && (
          <div className="rounded-xl bg-secondary/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">District</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{extras.district}</p>
          </div>
        )}
        {extras?.term_length && (
          <div className="rounded-xl bg-secondary/40 p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Term Length</p>
            <p className="text-sm font-bold text-foreground mt-0.5">{extras.term_length}</p>
          </div>
        )}
      </div>

      {nextElection && (
        <div className="mt-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/5 to-transparent p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Clock className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-foreground">Next Election</p>
              <p className="text-xs text-muted-foreground">
                {nextElection.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                {daysToNext !== null && ` — ${daysToNext} days away`}
              </p>
            </div>
            {user && (
              <Button
                size="sm"
                variant={reminderOn ? 'default' : 'outline'}
                onClick={handleNotify}
                disabled={toggling}
                className="rounded-xl gap-1.5 shrink-0"
              >
                <Bell className="h-3.5 w-3.5" />
                {reminderOn ? 'Notifying' : 'Notify Me'}
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Why I'm Running Video ─────────────────────────────────────────────────

export function WhyImRunningVideo({ candidateId }: { candidateId: string }) {
  const [extras, setExtras] = useState<CandidateProfileExtras | null>(null);

  useEffect(() => {
    getProfileExtras(candidateId).then(setExtras);
  }, [candidateId]);

  if (!extras?.why_im_running_video_url) return null;

  return (
    <Card className="overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 px-5 py-3 bg-secondary/40 border-b border-border/50">
        <Play className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm uppercase tracking-wide">Why I'm Running</h3>
      </div>
      <div className="relative bg-black aspect-[9/16] max-h-[420px] mx-auto" style={{ maxWidth: '280px' }}>
        <video
          src={extras.why_im_running_video_url}
          poster={extras.why_im_running_video_poster ?? undefined}
          controls
          className="h-full w-full object-cover"
          preload="metadata"
        />
      </div>
    </Card>
  );
}

// ─── Get to Know Me ────────────────────────────────────────────────────────

const GET_TO_KNOW_ICONS: Record<string, typeof Utensils> = {
  'favorite local restaurant': Utensils,
  'favorite sports team': Trophy,
  'first job': BriefcaseIcon,
  'favorite place in the district': MapPinIcon,
  'what made you enter public service': Heart,
  'one thing most voters don\'t know about you': Sparkles,
  'what does your perfect saturday look like': Calendar,
};

export function GetToKnowMe({ candidateId }: { candidateId: string }) {
  const [items, setItems] = useState<CandidateGetToKnow[]>([]);

  useEffect(() => {
    getGetToKnow(candidateId).then(setItems);
  }, [candidateId]);

  if (items.length === 0) return null;

  return (
    <Card className="p-5 rounded-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Heart className="h-4 w-4 text-accent" />
        <h3 className="font-bold text-sm uppercase tracking-wide">Get to Know Me</h3>
      </div>
      <div className="space-y-3">
        {items.map((item) => {
          const iconKey = item.question.toLowerCase();
          const Icon = GET_TO_KNOW_ICONS[iconKey] ?? Info;
          return (
            <div key={item.id} className="flex items-start gap-3 rounded-xl bg-secondary/30 p-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent/10">
                <Icon className="h-4 w-4 text-accent" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-muted-foreground">{item.question}</p>
                <p className="text-sm text-foreground mt-0.5 leading-relaxed">{item.answer}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Who Funds Me ──────────────────────────────────────────────────────────

const FUNDING_COLORS: Record<string, string> = {
  individuals: 'bg-primary',
  pac: 'bg-accent',
  organization: 'bg-warning',
  self_funded: 'bg-success',
  other: 'bg-muted-foreground',
};

const FUNDING_LABELS: Record<string, string> = {
  individuals: 'Individuals',
  pac: 'PACs',
  organization: 'Organizations',
  self_funded: 'Self-Funded',
  other: 'Other',
};

export function WhoFundsMe({ candidateId }: { candidateId: string }) {
  const [sources, setSources] = useState<CandidateFundingSource[]>([]);

  useEffect(() => {
    getFundingSources(candidateId).then(setSources);
  }, [candidateId]);

  if (sources.length === 0) return null;

  return (
    <Card className="p-5 rounded-2xl">
      <div className="flex items-center gap-2 mb-4">
        <CircleDollarSign className="h-4 w-4 text-success" />
        <h3 className="font-bold text-sm uppercase tracking-wide">Who Funds Me</h3>
      </div>

      {/* Stacked bar */}
      <div className="flex h-6 w-full overflow-hidden rounded-full bg-secondary mb-4">
        {sources.map((s) => (
          <div
            key={s.id}
            className={cn('transition-all', FUNDING_COLORS[s.source_type] ?? 'bg-muted')}
            style={{ width: `${s.percentage}%` }}
            title={`${FUNDING_LABELS[s.source_type] ?? s.source_type}: ${s.percentage}%`}
          />
        ))}
      </div>

      {/* Breakdown */}
      <div className="space-y-2.5">
        {sources.map((s) => (
          <div key={s.id} className="flex items-center gap-3">
            <div className={cn('h-3 w-3 rounded-full shrink-0', FUNDING_COLORS[s.source_type] ?? 'bg-muted')} />
            <span className="text-sm font-semibold text-foreground flex-1">
              {s.source_label ?? FUNDING_LABELS[s.source_type] ?? s.source_type}
            </span>
            <span className="text-sm font-extrabold text-foreground">{s.percentage}%</span>
            {s.amount_dollars != null && (
              <span className="text-xs text-muted-foreground">
                ${(s.amount_dollars / 1000).toFixed(0)}k
              </span>
            )}
          </div>
        ))}
      </div>

      {sources[0]?.report_date && (
        <p className="mt-3 text-[10px] text-muted-foreground">
          Data as of {new Date(sources[0].report_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
        </p>
      )}
    </Card>
  );
}

// ─── Endorsements ──────────────────────────────────────────────────────────

const ENDORSER_ICONS: Record<string, typeof Handshake> = {
  organization: Building2,
  elected_official: Users,
  union: Handshake,
  community_group: Heart,
  other: Award,
};

const ENDORSER_LABELS: Record<string, string> = {
  organization: 'Organization',
  elected_official: 'Elected Official',
  union: 'Union',
  community_group: 'Community Group',
  other: 'Other',
};

export function Endorsements({ candidateId }: { candidateId: string }) {
  const [items, setItems] = useState<CandidateEndorsement[]>([]);

  useEffect(() => {
    getEndorsements(candidateId).then(setItems);
  }, [candidateId]);

  if (items.length === 0) return null;

  return (
    <Card className="p-5 rounded-2xl">
      <div className="flex items-center gap-2 mb-4">
        <Handshake className="h-4 w-4 text-primary" />
        <h3 className="font-bold text-sm uppercase tracking-wide">Endorsements</h3>
        <Badge variant="secondary" className="rounded-lg text-[10px] font-bold ml-auto">
          {items.length}
        </Badge>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-2">
        {items.map((e) => {
          const Icon = ENDORSER_ICONS[e.endorser_type] ?? Award;
          return (
            <div key={e.id} className="flex items-start gap-3 rounded-xl bg-secondary/30 p-3">
              {e.endorser_logo_url ? (
                <img src={e.endorser_logo_url} alt="" className="h-9 w-9 rounded-lg object-cover shrink-0" />
              ) : (
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground truncate">{e.endorser_name}</p>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-[10px] font-semibold text-muted-foreground">
                    {ENDORSER_LABELS[e.endorser_type] ?? e.endorser_type}
                  </span>
                  {e.endorser_title && (
                    <span className="text-[10px] text-muted-foreground truncate">{e.endorser_title}</span>
                  )}
                </div>
                {e.endorsement_date && (
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    {new Date(e.endorsement_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
