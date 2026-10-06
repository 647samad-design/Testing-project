import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, CheckCircle2, XCircle, HelpCircle, AlertCircle, Plus, Scale } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { useAuth } from '@/hooks/use-auth';
import { usePageMeta } from '@/hooks/use-page-meta';
import { LoadingState, EmptyState } from '@/components/shared/StateComponents';
import { SourceCard } from '@/components/shared/SourceCard';
import { getClaims, submitClaim, getClaimEvidence } from '@/services/sources';
import { getCandidates } from '@/services/candidates';
import type { Claim, AssessmentStatus, Candidate, ClaimEvidence } from '@/types';
import { t } from '@/i18n';

const ASSESSMENT_META: Record<AssessmentStatus, { label: string; icon: typeof CheckCircle2; color: string; bg: string }> = {
  supported: { label: 'Supported by Evidence', icon: CheckCircle2, color: 'text-success', bg: 'bg-success/10' },
  unsupported: { label: 'Not Supported', icon: XCircle, color: 'text-destructive', bg: 'bg-destructive/10' },
  requires_context: { label: 'Requires Context', icon: AlertCircle, color: 'text-warning', bg: 'bg-warning/10' },
  insufficient_information: { label: 'Being Researched', icon: HelpCircle, color: 'text-muted-foreground', bg: 'bg-secondary' },
};

export function ClaimsLibraryPage() {
  usePageMeta({
    title: t("Claims Library"),
    description: t("Browse researched political claims with cited evidence, or submit a claim for our team to look into."),
  });
  const { user } = useAuth();
  const [claims, setClaims] = useState<Claim[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [evidenceByClaimId, setEvidenceByClaimId] = useState<Record<string, ClaimEvidence[]>>({});
  const [evidenceLoading, setEvidenceLoading] = useState(false);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [claimText, setClaimText] = useState('');
  const [claimCandidateId, setClaimCandidateId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [claimsData, candidatesData] = await Promise.all([getClaims(), getCandidates()]);
      setClaims(claimsData);
      setCandidates(candidatesData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load claims.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSubmitClaim() {
    if (!claimText.trim()) return;
    setSubmitting(true);
    try {
      const result = await submitClaim(claimText.trim(), claimCandidateId || undefined);
      if (!result) throw new Error('Failed to submit claim.');
      toast.success(t("Claim submitted — our team will research it."));
      setClaimText('');
      setClaimCandidateId('');
      setSubmitOpen(false);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit claim.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleExpand(claim: Claim) {
    if (expandedId === claim.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(claim.id);
    if (!evidenceByClaimId[claim.id]) {
      setEvidenceLoading(true);
      try {
        const evidence = await getClaimEvidence(claim.id);
        setEvidenceByClaimId((prev) => ({ ...prev, [claim.id]: evidence }));
      } catch {
        // Evidence failing to load shouldn't block seeing the claim/explanation.
      } finally {
        setEvidenceLoading(false);
      }
    }
  }

  const filteredClaims = claims.filter((c) =>
    !search.trim() || c.claim_text.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) return <LoadingState message={t("Loading claims library…")} />;

  return (
    <div className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
      <header className="mb-6">
        <div className="flex items-center gap-2.5">
          <Scale className="h-6 w-6 text-primary" />
          <h1 className="font-display text-2xl font-bold">{t("Claims Library")}</h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t("A researched library of political claims — each one reviewed by our team and backed by cited sources. Don't see a claim you've heard? Submit it below.")}</p>
      </header>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("Search claims…")}
            className="pl-10"
          />
        </div>
        {user && (
          <Button onClick={() => setSubmitOpen(true)} className="gap-1.5 shrink-0">
            <Plus className="h-4 w-4" /> {t("Submit a Claim")}</Button>
        )}
      </div>

      {filteredClaims.length === 0 ? (
        <EmptyState
          icon={<Scale className="h-8 w-8" />}
          title={claims.length === 0 ? t("No claims yet") : t("No matching claims")}
          description={claims.length === 0 ? t("Be the first to submit a claim for our team to research.") : t("Try a different search.")}
        />
      ) : (
        <div className="space-y-3">
          {filteredClaims.map((claim) => {
            const meta = ASSESSMENT_META[claim.assessment];
            const Icon = meta.icon;
            const isExpanded = expandedId === claim.id;
            return (
              <Card key={claim.id} className="p-5 rounded-2xl">
                <button
                  onClick={() => handleExpand(claim)}
                  className="w-full text-left"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-medium flex-1">{claim.claim_text}</p>
                    <span className={`shrink-0 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.bg} ${meta.color}`}>
                      <Icon className="h-3.5 w-3.5" />
                      {t(meta.label)}
                    </span>
                  </div>
                  {claim.candidate && (
                    <Link to={`/candidates/${claim.candidate.id}`} className="mt-1.5 inline-block text-xs text-primary hover:underline" onClick={(e) => e.stopPropagation()}>{t("Related to")} {claim.candidate.first_name} {claim.candidate.last_name}
                    </Link>
                  )}
                </button>
                {isExpanded && (
                  <div className="mt-4 border-t border-border pt-4 space-y-3">
                    {claim.explanation && (
                      <p className="text-sm text-muted-foreground leading-relaxed">{claim.explanation}</p>
                    )}
                    {evidenceLoading && !evidenceByClaimId[claim.id] ? (
                      <p className="text-sm text-muted-foreground">{t("Loading evidence…")}</p>
                    ) : (evidenceByClaimId[claim.id]?.length ?? 0) > 0 ? (
                      <div className="space-y-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("Evidence")}</p>
                        {evidenceByClaimId[claim.id].map((ev) => (
                          <div key={ev.id}>
                            {ev.source && <SourceCard source={ev.source} showBadge={false} />}
                            {ev.note && <p className="mt-1 text-xs text-muted-foreground pl-1">{ev.note}</p>}
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={submitOpen} onOpenChange={setSubmitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("Submit a claim")}</DialogTitle>
            <DialogDescription>{t("Heard something you're not sure is true? Submit it here and our team will research it with cited sources.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              value={claimText}
              onChange={(e) => setClaimText(e.target.value)}
              placeholder={t("e.g. 'Candidate X voted to raise property taxes three times'")}
            />
            <select
              value={claimCandidateId}
              onChange={(e) => setClaimCandidateId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t("Not about a specific candidate")}</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSubmitOpen(false)}>{t("Cancel")}</Button>
            <Button onClick={handleSubmitClaim} disabled={!claimText.trim() || submitting}>
              {submitting ? t("Submitting…") : t("Submit Claim")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
